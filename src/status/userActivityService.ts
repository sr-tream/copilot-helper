import * as vscode from 'vscode';
import { StatusLogger } from '../utils/statusLogger';

/**
 * User Activity Information Structure
 */
interface UserActivityInfo {
    lastActiveTime: number; // Timestamp of last activity
    instanceId: string; // Instance ID of last activity
    recentActivityCount: number; // Recent activity count (used to evaluate activity level)
    lastActivityType?: ActivityType; // Type of last activity
}

/**
 * User Activity Type Enum
 */
type ActivityType = 'windowFocus' | 'editorChange' | 'textEdit' | 'textSelection' | 'terminalChange';

/**
 * Throttle configuration for different activity types (milliseconds)
 */
const ACTIVITY_THROTTLE_CONFIG: Record<ActivityType, number> = {
    windowFocus: 5000, // Window focus change: 5 seconds
    editorChange: 3000, // Editor change: 3 seconds
    textEdit: 5000, // Text edit: 5 seconds
    textSelection: 2000, // Text selection: 2 seconds (most reliable user action)
    terminalChange: 3000 // Terminal change: 3 seconds
};

/**
 * User Activity Detection Service (Pure Static Class)
 * Responsible for monitoring and recording user activity status in VS Code
 * Supports multi-instance shared activity status
 */
export class UserActivityService {
    private static readonly USER_ACTIVITY_KEY = 'chp.user.activity'; // User activity storage key
    private static readonly ACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes activity timeout
    private static readonly ACTIVITY_COUNT_WINDOW = 5 * 60 * 1000; // Activity count window: 5 minutes
    private static readonly CACHE_VALIDITY = 5000; // Cache validity: 5 seconds

    // Static member variables
    private static instanceId: string;
    private static context: vscode.ExtensionContext | undefined;
    private static activityDisposables: vscode.Disposable[] = []; // Activity listeners
    private static lastRecordedActivityByType = new Map<ActivityType, number>(); // Last recorded activity time by type
    private static cachedActivityInfo: UserActivityInfo | null = null; // Memory cache
    private static lastCacheUpdate = 0; // Cache update time
    private static initialized = false;

    /**
     * Private constructor - prevent instantiation
     */
    private constructor() {
        throw new Error('UserActivityService is a static class and cannot be instantiated');
    }

    /**
     * Initialize activity detection service
     * @param context VS Code extension context
     * @param instanceId Current instance ID (provided by caller)
     */
    public static initialize(context: vscode.ExtensionContext, instanceId: string): void {
        if (this.initialized) {
            return;
        }

        this.context = context;
        this.instanceId = instanceId;

        // Register user activity listeners
        this.registerActivityListeners();

        this.initialized = true;
        StatusLogger.debug('[UserActivityService] User activity detection service initialized');
    }

    /**
     * Stop activity detection service
     */
    public static stop(): void {
        // Clear activity listeners
        this.activityDisposables.forEach(d => d.dispose());
        this.activityDisposables = [];

        // Clear cache and state
        this.cachedActivityInfo = null;
        this.lastCacheUpdate = 0;
        this.lastRecordedActivityByType.clear();

        this.initialized = false;
        StatusLogger.debug('[UserActivityService] User activity detection service stopped');
    }

    /**
     * Register user activity listeners
     * Only listen for real user actions, filter out automatic actions or non-user actions
     */
    private static registerActivityListeners(): void {
        if (!this.context) {
            return;
        }

        // Listen for window state changes (only user active focus)
        this.activityDisposables.push(
            vscode.window.onDidChangeWindowState(state => {
                if (state.focused) {
                    this.recordUserActivity('windowFocus');
                }
            })
        );

        // Listen for user active editor switching (filter out programmatic switching)
        this.activityDisposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (vscode.window.state.focused && editor) {
                    const scheme = editor.document.uri.scheme;
                    if (scheme === 'file' || scheme === 'untitled') {
                        this.recordUserActivity('editorChange');
                    }
                }
            })
        );

        // Listen for document content changes (only user edits, filter auto-formatting etc.)
        this.activityDisposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.contentChanges.length === 0) {
                    return;
                }
                if (!vscode.window.state.focused) {
                    return;
                }
                const scheme = event.document.uri.scheme;
                if (scheme !== 'file' && scheme !== 'untitled') {
                    return;
                }
                const totalChanges = event.contentChanges.reduce((sum, c) => sum + c.text.length + c.rangeLength, 0);
                if (totalChanges > 1000) {
                    return;
                }
                this.recordUserActivity('textEdit');
            })
        );

        // Listen for user selection changes (cursor movement, text selection) - this is the most reliable user action signal
        this.activityDisposables.push(
            vscode.window.onDidChangeTextEditorSelection(event => {
                if (!vscode.window.state.focused) {
                    return;
                }
                const scheme = event.textEditor.document.uri.scheme;
                if (scheme !== 'file' && scheme !== 'untitled') {
                    return;
                }
                if (
                    event.kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
                    event.kind === vscode.TextEditorSelectionChangeKind.Mouse
                ) {
                    this.recordUserActivity('textSelection');
                }
            })
        );

        // Listen for user active terminal switching
        this.activityDisposables.push(
            vscode.window.onDidChangeActiveTerminal(terminal => {
                if (vscode.window.state.focused && terminal) {
                    this.recordUserActivity('terminalChange');
                }
            })
        );

        // If window is focused on initialization, record once
        if (vscode.window.state.focused) {
            this.recordUserActivity('windowFocus');
        }

        StatusLogger.debug('[UserActivityService] User activity listeners registered (only listening for real user actions)');
    }

    /**
     * Check if specified activity type needs throttling
     * @param activityType Activity type
     * @returns true if throttling is needed (skip recording), false if recording is allowed
     */
    private static shouldThrottle(activityType: ActivityType): boolean {
        const now = Date.now();
        const lastRecorded = this.lastRecordedActivityByType.get(activityType) || 0;
        const throttleInterval = ACTIVITY_THROTTLE_CONFIG[activityType];
        return now - lastRecorded < throttleInterval;
    }

    /**
     * Record user activity status to globalState (with differentiated throttling)
     * Activity status from any instance will update the global last active time
     * Different activity types use different throttle intervals
     * @param activityType Activity type triggering the activity
     */
    private static async recordUserActivity(activityType: ActivityType): Promise<void> {
        if (!this.context) {
            return;
        }

        // Differentiated throttling: decide whether to record based on activity type
        if (this.shouldThrottle(activityType)) {
            return;
        }

        const now = Date.now();
        this.lastRecordedActivityByType.set(activityType, now);

        // Get current activity info, calculate activity count
        const currentInfo = this.getCachedActivityInfo();
        let recentActivityCount = 1;

        if (
            currentInfo &&
            typeof currentInfo.recentActivityCount === 'number' &&
            !isNaN(currentInfo.recentActivityCount)
        ) {
            // If last activity is within the statistical window, accumulate count; otherwise reset
            if (now - currentInfo.lastActiveTime < this.ACTIVITY_COUNT_WINDOW) {
                recentActivityCount = Math.min(currentInfo.recentActivityCount + 1, 100); // Max 100
            }
        }

        const activityInfo: UserActivityInfo = {
            lastActiveTime: now,
            instanceId: this.instanceId,
            recentActivityCount: recentActivityCount,
            lastActivityType: activityType
        };

        // Update cache
        this.cachedActivityInfo = activityInfo;
        this.lastCacheUpdate = now;

        await this.context.globalState.update(this.USER_ACTIVITY_KEY, activityInfo);
        StatusLogger.trace(
            `[UserActivityService] Record user activity status: type=${activityType}, count=${recentActivityCount}, time=${now}`
        );
    }

    /**
     * Get cached activity info (reduce globalState reads)
     */
    private static getCachedActivityInfo(): UserActivityInfo | null {
        const now = Date.now();

        // Check if cache is valid
        if (this.cachedActivityInfo && now - this.lastCacheUpdate < this.CACHE_VALIDITY) {
            return this.cachedActivityInfo;
        }

        // Cache expired, read from globalState
        if (!this.context) {
            return null;
        }

        const activityInfo = this.context.globalState.get<UserActivityInfo>(this.USER_ACTIVITY_KEY);
        if (activityInfo) {
            // Data validation and repair: ensure recentActivityCount is a valid number
            const isValidCount =
                typeof activityInfo.recentActivityCount === 'number' &&
                activityInfo.recentActivityCount >= 0 &&
                !isNaN(activityInfo.recentActivityCount);

            const validatedInfo: UserActivityInfo = {
                lastActiveTime: activityInfo.lastActiveTime ?? Date.now(),
                instanceId: activityInfo.instanceId ?? '',
                recentActivityCount: isValidCount ? activityInfo.recentActivityCount : 0,
                lastActivityType: activityInfo.lastActivityType
            };
            this.cachedActivityInfo = validatedInfo;
            this.lastCacheUpdate = now;
            return validatedInfo;
        }
        return null;
    }

    /**
     * Check if user has been active within the last 30 minutes
     * @returns true if user has been active within 30 minutes, false if inactive for more than 30 minutes
     */
    public static isUserActive(): boolean {
        const activityInfo = this.getCachedActivityInfo();
        if (!activityInfo) {
            // No activity record, consider inactive
            return false;
        }

        const now = Date.now();
        const inactiveTime = now - activityInfo.lastActiveTime;
        const isActive = inactiveTime <= this.ACTIVITY_TIMEOUT;

        StatusLogger.trace(
            `[UserActivityService] Check user activity status: lastActive=${activityInfo.lastActiveTime}, ` +
                `inactiveTime=${inactiveTime}ms, activityCount=${activityInfo.recentActivityCount}, isActive=${isActive}`
        );

        return isActive;
    }

    /**
     * Get user's last active time
     * @returns Last active timestamp, or undefined if no record
     */
    public static getLastActiveTime(): number | undefined {
        const activityInfo = this.getCachedActivityInfo();
        return activityInfo?.lastActiveTime;
    }

    /**
     * Get user's inactive duration (milliseconds)
     * @returns Inactive duration, or Infinity if no record
     */
    public static getInactiveTime(): number {
        const lastActiveTime = this.getLastActiveTime();
        if (lastActiveTime === undefined) {
            return Infinity;
        }
        return Date.now() - lastActiveTime;
    }
}
