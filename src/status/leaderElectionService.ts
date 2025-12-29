import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger';
import { UserActivityService } from './userActivityService';
import * as crypto from 'crypto';

interface LeaderInfo {
    instanceId: string;
    lastHeartbeat: number;
    electedAt: number; // Timestamp when election succeeded, used to resolve race conditions
}

/**
 * Master instance election service (pure static class)
 * Ensure that only one master instance is responsible for executing periodic tasks in multiple VS Code instances
 */
export class LeaderElectionService {
    private static readonly LEADER_KEY = 'chp.leader.info';
    private static readonly HEARTBEAT_INTERVAL = 5000; // 5-second heartbeat
    private static readonly LEADER_TIMEOUT = 15000; // 15-second timeout
    private static readonly TASK_INTERVAL = 60 * 1000; // Default task execution interval (1 minute)

    // Static member variables
    private static instanceId: string;
    private static context: vscode.ExtensionContext | undefined;
    private static heartbeatTimer: NodeJS.Timeout | undefined;
    private static taskTimer: NodeJS.Timeout | undefined;
    private static _isLeader = false;
    private static initialized = false;

    private static periodicTasks: Array<() => Promise<void>> = [];

    /**
     * Private constructor - prevent instantiation
     */
    private constructor() {
        throw new Error('LeaderElectionService is a static class and cannot be instantiated');
    }

    /**
     * Initialize election service (must be called when extension is activated)
     */
    public static initialize(context: vscode.ExtensionContext): void {
        if (this.initialized) {
            return;
        }

        this.registerPeriodicTask(async () => {
            StatusLogger.trace('[LeaderElectionService] Master instance periodic task: record survival log');
        });

        this.instanceId = crypto.randomUUID();
        this.context = context;
        StatusLogger.info(`[LeaderElectionService] Initialize master instance election service, current instance ID: ${this.instanceId}`);

        // Initialize user activity detection service
        UserActivityService.initialize(context, this.instanceId);

        // Add random delay (0-1000ms) to avoid race conditions when multiple instances start simultaneously
        const startDelay = Math.random() * 1000;
        setTimeout(() => {
            this.start();
        }, startDelay);

        this.initialized = true;
    }

    /**
     * Start election service
     */
    private static start(): void {
        if (!this.context) {
            StatusLogger.warn('[LeaderElectionService] Election service not initialized, cannot start');
            return;
        }

        this.checkLeader();
        this.heartbeatTimer = setInterval(() => this.checkLeader(), this.HEARTBEAT_INTERVAL);

        // Start periodic task check
        this.taskTimer = setInterval(() => {
            if (this._isLeader) {
                this.executePeriodicTasks();
            }
        }, this.TASK_INTERVAL);
    }

    /**
     * Stop election service
     */
    public static stop(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        if (this.taskTimer) {
            clearInterval(this.taskTimer);
            this.taskTimer = undefined;
        }

        // Stop user activity detection service
        UserActivityService.stop();

        // If is Leader, try to actively release
        this.resignLeader();
        this.initialized = false;
    }

    /**
     * Register periodic task (executed only on master instance)
     * @param task Task function
     */
    public static registerPeriodicTask(task: () => Promise<void>): void {
        this.periodicTasks.push(task);
    }

    /**
     * Get whether current instance is master instance
     */
    public static isLeader(): boolean {
        return this._isLeader;
    }

    /**
     * Get current instance ID
     */
    public static getInstanceId(): string {
        return this.instanceId;
    }

    /**
     * Get master instance ID (if exists)
     */
    public static getLeaderId(): string | undefined {
        if (!this.context) {
            return undefined;
        }
        const leaderInfo = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);
        return leaderInfo?.instanceId;
    }

    private static async checkLeader(): Promise<void> {
        if (!this.context) {
            return;
        }

        const now = Date.now();
        const leaderInfo = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);
        StatusLogger.trace(
            `[LeaderElectionService] Heartbeat check: leaderInfo=${leaderInfo ? `instanceId=${leaderInfo.instanceId}, lastHeartbeat=${leaderInfo.lastHeartbeat}` : 'null'}`
        );

        if (!leaderInfo) {
            // No Leader, try to become Leader
            StatusLogger.trace('[LeaderElectionService] No Leader found, attempting election...');
            await this.becomeLeader();
            return;
        }

        if (leaderInfo.instanceId === this.instanceId) {
            // I am Leader, update heartbeat
            StatusLogger.trace('[LeaderElectionService] Confirming self as Leader, updating heartbeat');
            await this.updateHeartbeat();
            if (!this._isLeader) {
                this._isLeader = true;
                StatusLogger.info('[LeaderElectionService] Current instance has become master instance');
            }
        } else {
            // Someone else is Leader
            StatusLogger.trace(`[LeaderElectionService] Detected other Leader: ${leaderInfo.instanceId}`);
            // If I was previously Leader, but now the Leader in globalState is not me, it means I was overwritten by another instance
            if (this._isLeader) {
                this._isLeader = false;
                StatusLogger.warn(
                    `[LeaderElectionService] Detected master instance overwritten by another instance ${leaderInfo.instanceId}, current instance resigning`
                );
            }

            // Check if this Leader has timed out
            const heartbeatAge = now - leaderInfo.lastHeartbeat;
            StatusLogger.trace(
                `[LeaderElectionService] Leader heartbeat age: ${heartbeatAge}ms (timeout threshold: ${this.LEADER_TIMEOUT}ms)`
            );
            if (heartbeatAge > this.LEADER_TIMEOUT) {
                StatusLogger.info(`[LeaderElectionService] Master instance ${leaderInfo.instanceId} heartbeat timeout, attempting takeover...`);
                await this.becomeLeader();
            }
        }
    }

    private static async becomeLeader(): Promise<void> {
        if (!this.context) {
            return;
        }

        StatusLogger.trace('[LeaderElectionService] Starting election process...');
        // Read current Leader information
        const existingLeader = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);

        // If there is already a Leader and not timed out, should not attempt election
        if (existingLeader) {
            const now = Date.now();
            const heartbeatAge = now - existingLeader.lastHeartbeat;
            if (heartbeatAge <= this.LEADER_TIMEOUT) {
                StatusLogger.trace(
                    `[LeaderElectionService] Active master instance ${existingLeader.instanceId} already exists (heartbeat age: ${heartbeatAge}ms), abandoning election`
                );
                return;
            }
        }

        const now = Date.now();
        const info: LeaderInfo = {
            instanceId: this.instanceId,
            lastHeartbeat: now,
            electedAt: now
        };

        StatusLogger.trace(`[LeaderElectionService] Writing election info: instanceId=${this.instanceId}, electedAt=${now}`);
        // Attempt to write
        await this.context.globalState.update(this.LEADER_KEY, info);

        // Wait a short time to let other competitors complete writing
        StatusLogger.trace('[LeaderElectionService] Waiting for other competitors to write...');
        await new Promise(resolve => setTimeout(resolve, 100));

        // Read again to confirm who finally became Leader
        const currentInfo = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);

        if (!currentInfo) {
            StatusLogger.warn('[LeaderElectionService] Election failed: unable to read Leader information');
            return;
        }

        StatusLogger.trace(
            `[LeaderElectionService] Election result: current Leader=${currentInfo.instanceId}, electedAt=${currentInfo.electedAt}`
        );
        // Comparison strategy: first compare electedAt timestamp, then compare instanceId string
        const isWinner =
            currentInfo.instanceId === this.instanceId ||
            (currentInfo.electedAt === info.electedAt && currentInfo.instanceId < this.instanceId);

        if (isWinner && currentInfo.instanceId === this.instanceId) {
            if (!this._isLeader) {
                this._isLeader = true;
                StatusLogger.info('[LeaderElectionService] Election successful, current instance becomes master instance');
            }
        } else {
            StatusLogger.debug(
                `[LeaderElectionService] Election failed, instance ${currentInfo.instanceId} becomes master instance (electedAt: ${currentInfo.electedAt})`
            );
            // If previously mistakenly thought I was Leader, now resign
            if (this._isLeader) {
                this._isLeader = false;
                StatusLogger.info(`[LeaderElectionService] Election failed, instance ${currentInfo.instanceId} becomes master instance`);
            }
        }
    }

    private static async updateHeartbeat(): Promise<void> {
        if (!this._isLeader || !this.context) {
            return;
        }

        // Read current Leader information to preserve electedAt
        const currentInfo = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);
        const newHeartbeat = Date.now();

        const info: LeaderInfo = {
            instanceId: this.instanceId,
            lastHeartbeat: newHeartbeat,
            electedAt: currentInfo?.electedAt || newHeartbeat
        };
        StatusLogger.trace(`[LeaderElectionService] Update heartbeat: lastHeartbeat=${newHeartbeat}`);
        await this.context.globalState.update(this.LEADER_KEY, info);
    }

    private static async resignLeader(): Promise<void> {
        if (this._isLeader && this.context) {
            const currentInfo = this.context.globalState.get<LeaderInfo>(this.LEADER_KEY);
            // Unconditionally clear Leader information to ensure complete exit from master instance when releasing
            if (currentInfo && currentInfo.instanceId === this.instanceId) {
                await this.context.globalState.update(this.LEADER_KEY, undefined);
                StatusLogger.info('[LeaderElectionService] Instance release: master instance identity cleared');
            }
            this._isLeader = false;
            StatusLogger.debug('[LeaderElectionService] Instance release: exited master instance identity');
        }
    }

    private static async executePeriodicTasks(): Promise<void> {
        // Check if user has been active within 30 minutes (using UserActivityService)
        if (!UserActivityService.isUserActive()) {
            const inactiveMinutes = Math.floor(UserActivityService.getInactiveTime() / 60000);
            StatusLogger.debug(`[LeaderElectionService] User inactive for ${inactiveMinutes} minutes, pausing periodic task execution`);
            return;
        }

        StatusLogger.trace(`[LeaderElectionService] Starting execution of ${this.periodicTasks.length} periodic tasks...`);
        for (const task of this.periodicTasks) {
            try {
                await task();
            } catch (error) {
                StatusLogger.error('[LeaderElectionService] Error executing periodic task:', error);
            }
        }
        StatusLogger.trace('[LeaderElectionService] Periodic task execution completed');
    }
}
