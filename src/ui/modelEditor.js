/**
 * 模型编辑器 - 客户端脚本
 * 负责 DOM 创建、事件绑定和与 VSCode 通信
 */

// VSCode API
const vscode = acquireVsCodeApi();

// 类型定义
/**
 * @typedef {Object} Provider
 * @property {string} id - 提供商ID
 * @property {string} name - 提供商名称
 */

/**
 * @typedef {Object} ModelCapabilities
 * @property {boolean} toolCalling - 是否支持工具调用
 * @property {boolean} imageInput - 是否支持图像输入
 */

/**
 * @typedef {Object} ModelData
 * @property {string} id - 模型ID
 * @property {string} name - 显示名称
 * @property {string} [tooltip] - 描述（可选）
 * @property {string} provider - 提供商标识符
 * @property {string} [baseUrl] - API基础URL（可选）
 * @property {string} [model] - 请求模型ID（可选）
 * @property {'openai'|'openai-sse'|'anthropic'} sdkMode - SDK兼容模式
 * @property {number} maxInputTokens - 最大输入Token
 * @property {number} maxOutputTokens - 最大输出Token
 * @property {ModelCapabilities} capabilities - 能力配置
 * @property {boolean} outputThinking - 是否在聊天界面显示思考过程（推荐thinking模型启用）
 * @property {boolean} includeThinking - 多轮对话是否注入思考内容到上下文（thinking模型必须启用）
 * @property {Object} [customHeader] - 自定义HTTP头部（可选）
 * @property {Object} [extraBody] - 额外请求体参数（可选）
 */

// 全局变量
/** @type {Provider[]} */
let allProviders = [];
/** @type {ModelData} */
let modelData = {};
/** @type {boolean} */
let isCreateMode = false;

/**
 * 初始化编辑器
 * @param {ModelData} data - 模型数据
 * @param {boolean} createMode - 是否为创建模式
 * @returns {void}
 */
function initializeEditor(data, createMode) {
    modelData = data;
    isCreateMode = createMode;

    // 创建 DOM
    createDOM();

    // 绑定事件
    bindEvents();

    // 请求提供商列表
    vscode.postMessage({ command: 'getProviders' });

    // 初始化 JSON 验证
    validateJSON_UI('customHeader');
    validateJSON_UI('extraBody');
}

/**
 * 创建 DOM 结构
 * @returns {void}
 */
function createDOM() {
    const container = document.getElementById('app');

    // Create basic information section
    const basicSection = createSection('Basic Information', [
        createFormGroup(
            'modelId',
            `Model ID${isCreateMode ? ' *' : ''}`,
            'id',
            'input',
            {
                type: 'text',
                placeholder: 'Example: zhipu:glm-4.6',
                value: modelData.id,
                readonly: !isCreateMode
            },
            isCreateMode ? 'Unique model identifier, cannot be changed after creation' : 'Unique model identifier, cannot be changed, please edit config file directly if modification needed.'
        ),
        createFormGroup('modelName', 'Display Name *', 'name', 'input', {
            type: 'text',
            placeholder: 'Example: GLM-4.6 (Zhipu AI)',
            value: modelData.name
        }, 'Name displayed in model selector'),
        createFormGroup('modelTooltip', 'Description', 'tooltip', 'textarea', {
            rows: 2,
            placeholder: 'Detailed model description (optional)',
            value: modelData.tooltip
        }, 'Tooltip displayed on hover'),
        createFormGroup('requestModel', 'Request Model ID', 'model', 'input', {
            type: 'text',
            placeholder: 'Example: gpt-4',
            value: modelData.model
        }, 'Model ID used when making requests (optional), uses Model ID (id) value if left empty')
    ]);

    // Create API configuration section
    const apiSection = createSection('API Configuration', [
        createProviderFormGroup(),
        createFormGroup('sdkMode', 'SDK Mode', 'sdkMode', 'select', {
            options: [
                { value: 'openai', label: 'OpenAI SDK (use official SDK for streaming data processing)', selected: modelData.sdkMode === 'openai' },
                { value: 'openai-sse', label: 'OpenAI SSE (use built-in compatible parser for streaming data processing)', selected: modelData.sdkMode === 'openai-sse' },
                { value: 'anthropic', label: 'Anthropic SDK (use official SDK for streaming data processing)', selected: modelData.sdkMode === 'anthropic' }
            ]
        }, 'Compatibility mode used for model communication'),
        createFormGroup('baseUrl', 'BASE URL *', 'baseUrl', 'input', {
            type: 'url',
            placeholder: 'Example: https://api.openai.com/v1 or https://api.anthropic.com',
            value: modelData.baseUrl
        }, 'Base URL address for API requests, must start with http:// or https://\nExample: https://api.openai.com/v1 or https://api.anthropic.com')
    ]);

    // Create performance settings section
    const perfSection = createSection('Model Performance', [
        createFormGroup('maxInputTokens', 'Max Input Tokens', 'maxInputTokens', 'input', {
            type: 'number',
            min: 128,
            value: modelData.maxInputTokens
        }, 'Maximum input context limit supported by the model'),
        createFormGroup('maxOutputTokens', 'Max Output Tokens', 'maxOutputTokens', 'input', {
            type: 'number',
            min: 8,
            value: modelData.maxOutputTokens
        }, 'Maximum output token limit supported by the model')
    ]);

    // Create capability configuration section
    const capSection = createSection('Model Capabilities', [
        createCheckboxFormGroup('toolCalling', 'Support Tool Calling', 'capabilities.toolCalling', modelData.toolCalling),
        createCheckboxFormGroup('imageInput', 'Support Image Input', 'capabilities.imageInput', modelData.imageInput)
    ]);

    // Create advanced settings section
    const advSection = createSection('Advanced Settings', [
        createCheckboxFormGroup(
            'outputThinking',
            'Show Thinking Process in Chat UI',
            'outputThinking',
            modelData.outputThinking,
            'Display model\'s thinking process in chat interface. Enable this to see <thinking> tags in responses. Recommended for thinking models like Claude Sonnet/Opus 4.5.'
        ),
        createCheckboxFormGroup(
            'includeThinking',
            'Inject Thinking into Multi-turn Conversations',
            'includeThinking',
            modelData.includeThinking,
            'Include thinking content when sending conversation history to model. Required for thinking models to maintain context. Enable this for Claude Sonnet/Opus 4.5 thinking models.'
        ),
        createJSONFormGroup('customHeader', 'Custom HTTP Header (JSON format)', 'customHeader', modelData.customHeader,
            '{"Authorization": "Bearer ${APIKEY}", "X-Custom-Header": "value"}',
            'Optional custom HTTP header configuration. Supports ${APIKEY} placeholder to auto-replace with actual API key.'
        ),
        createJSONFormGroup('extraBody', 'Extra Request Body Parameters (JSON format)', 'extraBody', modelData.extraBody,
            '{"temperature": 1, "top_p": null}',
            'Extra request body parameters, will be merged into request body in API. If model doesn\'t support certain parameters, can set to null to remove corresponding values.'
        )
    ]);

    // 创建按钮组
    const buttonGroup = createButtonGroup();

    // 创建全局错误提示条
    const errorBanner = createErrorBanner();

    // 添加到容器（错误提示在最顶部）
    container.appendChild(errorBanner);
    container.appendChild(basicSection);
    container.appendChild(apiSection);
    container.appendChild(perfSection);
    container.appendChild(capSection);
    container.appendChild(advSection);
    container.appendChild(buttonGroup);
}

/**
 * 创建 section 元素
 * @param {string} title - 章节标题
 * @param {Array<HTMLElement>} formGroups - 表单组元素数组
 * @returns {HTMLElement} 创建的章节元素
 */
function createSection(title, formGroups) {
    const section = document.createElement('div');
    section.className = 'section';

    const h3 = document.createElement('h3');
    h3.textContent = title;
    section.appendChild(h3);

    formGroups.forEach(group => section.appendChild(group));

    return section;
}

/**
 * 创建表单组
 * @param {string} id - 表单元素的ID
 * @param {string} labelText - 标签显示文本
 * @param {string} fieldName - 字段名称（在括号中显示）
 * @param {string} elementType - 元素类型：'input'、'textarea' 或 'select'
 * @param {Object} attrs - 元素属性对象
 * @param {string} [helpText] - 帮助文本（可选）
 * @returns {HTMLElement} 创建的表单组元素
 */
function createFormGroup(id, labelText, fieldName, elementType, attrs, helpText) {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = id;
    label.innerHTML = `${labelText} <span class="field-name">(${fieldName})</span>`;
    group.appendChild(label);

    let element;
    if (elementType === 'input') {
        element = document.createElement('input');
        Object.entries(attrs).forEach(([key, value]) => {
            if (key === 'readonly' && value) {
                element.setAttribute('readonly', '');
                element.classList.add('readonly');
            } else if (key !== 'readonly') {
                element.setAttribute(key, value || '');
            }
        });
    } else if (elementType === 'textarea') {
        element = document.createElement('textarea');
        Object.entries(attrs).forEach(([key, value]) => {
            if (key === 'value') {
                element.textContent = value || '';
            } else {
                element.setAttribute(key, value || '');
            }
        });
    } else if (elementType === 'select') {
        element = document.createElement('select');
        attrs.options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.selected) option.selected = true;
            element.appendChild(option);
        });
    }

    element.id = id;
    group.appendChild(element);

    if (helpText) {
        const help = document.createElement('div');
        help.className = 'help-text detailed';
        help.textContent = helpText;
        group.appendChild(help);
    }

    return group;
}

/**
 * 创建复选框表单组
 * @param {string} id - 复选框元素的ID
 * @param {string} labelText - 标签显示文本
 * @param {string} fieldName - 字段名称（在括号中显示）
 * @param {boolean} checked - 复选框是否选中
 * @param {string} [detailedHelp] - 详细的帮助文本（可选）
 * @returns {HTMLElement} 创建的复选框表单组元素
 */
function createCheckboxFormGroup(id, labelText, fieldName, checked, detailedHelp) {
    const group = document.createElement('div');
    group.className = 'form-group';

    const checkboxGroup = document.createElement('div');
    checkboxGroup.className = 'checkbox-group';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.checked = checked || false;

    const label = document.createElement('label');
    label.htmlFor = id;
    label.innerHTML = `${labelText} <span class="field-name">(${fieldName})</span>`;

    checkboxGroup.appendChild(checkbox);
    checkboxGroup.appendChild(label);
    group.appendChild(checkboxGroup);

    if (detailedHelp) {
        const help = document.createElement('div');
        help.className = 'help-text detailed';
        help.textContent = detailedHelp;
        group.appendChild(help);
    } else {
        group.classList.add('no-bottom');
    }

    return group;
}



/**
 * 创建提供商表单组
 * @returns {HTMLElement} 创建的提供商表单组元素
 */
function createProviderFormGroup() {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = 'provider';
    label.innerHTML = 'Provider * <span class="field-name">(provider)</span>';
    group.appendChild(label);

    const dropdown = document.createElement('div');
    dropdown.className = 'provider-dropdown';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'provider';
    input.className = 'provider-input';
    input.value = modelData.provider;
    input.placeholder = 'Example: zhipu';
    input.autocomplete = 'off';

    const list = document.createElement('div');
    list.className = 'provider-list';
    list.id = 'providerList';

    dropdown.appendChild(input);
    dropdown.appendChild(list);
    group.appendChild(dropdown);

    const help = document.createElement('div');
    help.className = 'help-text';
    help.textContent = 'Model provider identifier (can select built-in/known providers or custom input)';
    group.appendChild(help);

    return group;
}

/**
 * 创建 JSON 表单组
 * @param {string} id - 表单元素的ID
 * @param {string} labelText - 标签显示文本
 * @param {string} fieldName - 字段名称（在括号中显示）
 * @param {string} value - JSON 字符串值
 * @param {string} placeholder - 占位符文本
 * @param {string} helpText - 帮助文本
 * @returns {HTMLElement} 创建的 JSON 表单组元素
 */
function createJSONFormGroup(id, labelText, fieldName, value, placeholder, helpText) {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = id;
    label.innerHTML = `${labelText} <span class="field-name">(${fieldName})</span>`;
    group.appendChild(label);

    const container = document.createElement('div');
    container.className = 'json-container';

    const toolbar = document.createElement('div');
    toolbar.className = 'json-toolbar';

    const formatBtn = document.createElement('button');
    formatBtn.type = 'button';
    formatBtn.className = 'json-button';
    formatBtn.textContent = 'Format';
    formatBtn.onclick = (e) => {
        e.preventDefault();
        formatJSON(id);
    };

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'json-button';
    clearBtn.textContent = 'Clear';
    clearBtn.onclick = (e) => {
        e.preventDefault();
        clearJSON(id);
    };

    const status = document.createElement('div');
    status.className = 'json-status';
    status.id = `${id}Status`;

    const indicator = document.createElement('span');
    indicator.className = 'json-status-indicator';

    const statusText = document.createElement('span');
    statusText.id = `${id}StatusText`;
    statusText.textContent = 'Không có nội dung';

    status.appendChild(indicator);
    status.appendChild(statusText);

    toolbar.appendChild(formatBtn);
    toolbar.appendChild(clearBtn);
    toolbar.appendChild(status);
    container.appendChild(toolbar);

    const textarea = document.createElement('textarea');
    textarea.id = id;
    textarea.className = 'json-input';
    textarea.placeholder = placeholder;
    textarea.value = value || '';

    container.appendChild(textarea);

    const error = document.createElement('div');
    error.className = 'json-error';
    error.id = `${id}Error`;
    container.appendChild(error);

    group.appendChild(container);

    const help = document.createElement('div');
    help.className = 'help-text detailed';
    help.textContent = helpText;
    group.appendChild(help);

    return group;
}

/**
 * 创建全局错误提示区域
 * @returns {HTMLElement} 创建的错误提示元素
 */
function createErrorBanner() {
    const banner = document.createElement('div');
    banner.id = 'globalErrorBanner';
    banner.className = 'error-banner';
    banner.style.display = 'none';

    const messageSpan = document.createElement('span');
    messageSpan.id = 'globalErrorMessage';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'error-banner-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = hideGlobalError;

    banner.appendChild(messageSpan);
    banner.appendChild(closeBtn);

    return banner;
}

/**
 * 创建按钮组
 * @returns {HTMLElement} 创建的按钮组元素
 */
function createButtonGroup() {
    const group = document.createElement('div');
    group.className = 'button-group';

    // 创建内部容器以实现居中对齐
    const inner = document.createElement('div');
    inner.className = 'button-group-inner';

    // 左侧按钮容器（删除按钮）
    const leftButtons = document.createElement('div');
    leftButtons.style.display = 'flex';
    leftButtons.style.gap = '10px';

    // 右侧按钮容器（保存和取消按钮）
    const rightButtons = document.createElement('div');
    rightButtons.style.display = 'flex';
    rightButtons.style.gap = '10px';

    // 如果是编辑模式，添加删除按钮到左侧
    if (!isCreateMode) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-button';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = deleteModel;
        leftButtons.appendChild(deleteBtn);
    }

    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary-button';
    saveBtn.textContent = isCreateMode ? 'Create' : 'Update';
    saveBtn.onclick = saveModel;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'secondary-button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = cancelEdit;

    rightButtons.appendChild(saveBtn);
    rightButtons.appendChild(cancelBtn);

    inner.appendChild(leftButtons);
    inner.appendChild(rightButtons);
    group.appendChild(inner);

    return group;
}

/**
 * 自动调整单个 textarea 的高度以适应内容
 * @param {HTMLTextAreaElement} textarea - textarea 元素
 * @returns {void}
 */
function autoResizeTextarea(textarea) {
    if (!textarea) return;

    // 重置高度以获取正确的 scrollHeight
    textarea.style.height = 'auto';

    // 设置新高度(scrollHeight + 边框)
    const newHeight = textarea.scrollHeight;
    textarea.style.height = newHeight + 'px';
}

/**
 * 为所有 textarea 元素添加自动扩展高度的功能
 * @returns {void}
 */
function autoResizeAllTextareas() {
    const textareas = document.querySelectorAll('textarea');

    textareas.forEach(textarea => {
        // 初始化时调整一次高度
        autoResizeTextarea(textarea);

        // 监听输入事件,实时调整高度
        textarea.addEventListener('input', function () {
            autoResizeTextarea(this);
        });

        // 监听 change 事件(例如粘贴后)
        textarea.addEventListener('change', function () {
            autoResizeTextarea(this);
        });

        // 监听 paste 事件
        textarea.addEventListener('paste', function () {
            // 使用 setTimeout 确保内容已经粘贴
            setTimeout(() => {
                autoResizeTextarea(this);
            }, 0);
        });
    });
}

/**
 * 通用输入验证 - 非空验证
 * @param {HTMLElement} element - 要验证的输入元素
 * @returns {void}
 */
function addSimpleValidation(element) {
    element.addEventListener('input', function () {
        if (this.value.trim()) {
            this.classList.remove('invalid');
        } else {
            this.classList.add('invalid');
        }
    });
}

/**
 * 通用数字验证 - 必须为正整数
 * @param {HTMLElement} element - 要验证的输入元素
 * @returns {void}
 */
function addNumberValidation(element) {
    element.addEventListener('input', function () {
        const value = parseInt(this.value);
        if (value && value > 0) {
            this.classList.remove('invalid');
        } else {
            this.classList.add('invalid');
        }
    });
}

/**
 * 检查是否为有效的 JSON 对象（非数组、非 null、非基本类型）
 * @param {*} parsed - 已解析的 JSON 数据
 * @returns {boolean} 是否为有效的 JSON 对象
 */
function isValidJSONObject(parsed) {
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
}

/**
 * 绑定事件
 */
/**
 * 绑定事件监听器
 * @returns {void}
 */
function bindEvents() {
    // 必填字段实时验证
    const modelId = document.getElementById('modelId');
    const modelName = document.getElementById('modelName');
    const provider = document.getElementById('provider');
    const baseUrl = document.getElementById('baseUrl');
    const maxInputTokens = document.getElementById('maxInputTokens');
    const maxOutputTokens = document.getElementById('maxOutputTokens');

    // 为所有 textarea 添加自动扩展高度的功能
    autoResizeAllTextareas();

    // 模型ID验证
    if (modelId && !modelId.readOnly) {
        addSimpleValidation(modelId);
    }

    // 显示名称验证
    addSimpleValidation(modelName);

    // 提供商验证
    addSimpleValidation(provider);

    // baseUrl验证（必填 + URL格式）
    baseUrl.addEventListener('input', function () {
        const value = this.value.trim();
        if (!value) {
            this.classList.add('invalid');
            return;
        }
        try {
            const urlObj = new URL(value);
            if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
                this.classList.remove('invalid');
            } else {
                this.classList.add('invalid');
            }
        } catch (e) {
            this.classList.add('invalid');
        }
    });

    // Token数量验证
    addNumberValidation(maxInputTokens);
    addNumberValidation(maxOutputTokens);

    // JSON 验证事件
    const customHeader = document.getElementById('customHeader');
    const extraBody = document.getElementById('extraBody');

    customHeader.addEventListener('input', () => validateJSON_UI('customHeader'));
    customHeader.addEventListener('change', () => validateJSON_UI('customHeader'));

    extraBody.addEventListener('input', () => validateJSON_UI('extraBody'));
    extraBody.addEventListener('change', () => validateJSON_UI('extraBody'));

    // 提供商输入事件
    const providerInput = document.getElementById('provider');
    const providerList = document.getElementById('providerList');

    providerInput.addEventListener('input', function () {
        const searchText = this.value.toLowerCase();
        if (searchText) {
            const filtered = allProviders.filter(
                p => p.id.toLowerCase().includes(searchText) || p.name.toLowerCase().includes(searchText)
            );
            renderProviderList(filtered);
            providerList.classList.add('show');
        } else {
            providerList.classList.remove('show');
        }
    });

    providerInput.addEventListener('focus', function () {
        if (allProviders && allProviders.length > 0) {
            renderProviderList(allProviders);
            providerList.classList.add('show');
        }
    });

    document.addEventListener('click', function (event) {
        if (!event.target.closest('.provider-dropdown')) {
            providerList.classList.remove('show');
        }
    });

    // VSCode 消息事件
    window.addEventListener('message', function (event) {
        const message = event.data;
        if (message.command === 'setProviders') {
            updateProviderList(message.providers);
        }
    });
}

/**
 * JSON 验证
 */
/**
 * 验证 JSON 字符串格式
 * @param {string} jsonString - 要验证的 JSON 字符串
 * @returns {boolean} JSON 是否有效
 */
/**
 * 验证 JSON 字符串格式
 * @param {string} jsonString - 要验证的 JSON 字符串
 * @returns {boolean} JSON 是否有效
 */
function validateJSON(jsonString) {
    if (!jsonString || jsonString.trim() === '') {
        return true;
    }
    try {
        const parsed = JSON.parse(jsonString);
        // 必须是对象类型，不能是数组、字符串、数字等
        return isValidJSONObject(parsed);
    } catch (e) {
        return false;
    }
}

/**
 * 解析 JSON 字符串
 * @param {string} jsonString - 要解析的 JSON 字符串
 * @returns {Object|undefined} 解析后的对象，如果解析失败则返回 undefined
 */
/**
 * 解析 JSON 字符串
 * @param {string} jsonString - 要解析的 JSON 字符串
 * @returns {Object|undefined} 解析后的对象，如果解析失败或不是对象则返回 undefined
 */
function parseJSON(jsonString) {
    if (!jsonString || jsonString.trim() === '') {
        return undefined;
    }
    try {
        const parsed = JSON.parse(jsonString);
        // 必须是对象类型，不能是数组、字符串、数字等
        if (isValidJSONObject(parsed)) {
            return parsed;
        }
        return undefined;
    } catch (e) {
        return undefined;
    }
}

/**
 * 验证 JSON 并更新 UI 状态（仅视觉反馈，不获取焦点）
 * @param {string} fieldId - 表单字段的 ID
 * @returns {boolean} JSON 是否有效
 */
function validateJSON_UI(fieldId) {
    const textarea = document.getElementById(fieldId);
    const statusDiv = document.getElementById(fieldId + 'Status');
    const statusText = document.getElementById(fieldId + 'StatusText');
    const errorDiv = document.getElementById(fieldId + 'Error');
    const content = textarea.value.trim();

    // 移除所有验证状态类
    textarea.classList.remove('json-valid', 'json-invalid');
    if (errorDiv) {
        errorDiv.classList.remove('show');
    }

    if (!content) {
        const indicator = statusDiv.querySelector('.json-status-indicator');
        indicator.className = 'json-status-indicator';
        statusText.textContent = 'No content';
        return true;
    }

    try {
        const parsed = JSON.parse(content);
        // 必须是对象类型,不能是数组、字符串、数字等
        if (isValidJSONObject(parsed)) {
            // 验证通过 - 恢复默认状态（不添加绿色样式）
            const indicator = statusDiv.querySelector('.json-status-indicator');
            indicator.className = 'json-status-indicator';
            statusText.textContent = 'Valid ✓';
            return true;
        } else {
            // 不是对象类型 - 显示红色错误状态
            textarea.classList.add('json-invalid');
            const indicator = statusDiv.querySelector('.json-status-indicator');
            indicator.className = 'json-status-indicator invalid';
            statusText.textContent = 'Invalid ✗';
            if (errorDiv) {
                errorDiv.textContent = 'Must be object type (like {"key": "value"}), cannot be array, number or string';
                errorDiv.classList.add('show');
            }
            return false;
        }
    } catch (e) {
        // JSON parsing error - show red error state
        textarea.classList.add('json-invalid');
        const indicator = statusDiv.querySelector('.json-status-indicator');
        indicator.className = 'json-status-indicator invalid';
        statusText.textContent = 'Invalid ✗';
        if (errorDiv) {
            errorDiv.textContent = 'Error: ' + e.message;
            errorDiv.classList.add('show');
        }
        return false;
    }
}

/**
 * 格式化 JSON 字符串
 * @param {string} fieldId - 表单字段的 ID
 * @returns {void}
 */
function formatJSON(fieldId) {
    const textarea = document.getElementById(fieldId);
    const content = textarea.value.trim();

    if (!content) {
        showGlobalError('No content to format');
        return;
    }

    try {
        const parsed = JSON.parse(content);
        // 必须是对象类型，与 validateJSON 逻辑保持一致
        if (!isValidJSONObject(parsed)) {
            showGlobalError('JSON format error: Must be object type (like {"key": "value"}), cannot be array, number or string');
            return;
        }
        textarea.value = JSON.stringify(parsed, null, 2);
        validateJSON_UI(fieldId);
        // 格式化后调整高度
        autoResizeTextarea(textarea);
        textarea.style.opacity = '0.7';
        setTimeout(() => {
            textarea.style.opacity = '1';
        }, 200);
        // 格式化成功时清除错误提示
        hideGlobalError();
    } catch (e) {
        showGlobalError('JSON format error, cannot format:\n' + e.message);
    }
}

/**
 * 清空 JSON 字段内容
 * @param {string} fieldId - 表单字段的 ID
 * @returns {void}
 */
function clearJSON(fieldId) {
    const textarea = document.getElementById(fieldId);
    // 直接清空，无需确认（用户可以通过取消保存或 Ctrl+Z 恢复）
    textarea.value = '';
    validateJSON_UI(fieldId);
    // 清空后调整高度
    autoResizeTextarea(textarea);
}

/**
 * 提供商列表管理
 * @param {Provider[]} providers - 提供商列表
 * @returns {void}
 */
function updateProviderList(providers) {
    allProviders = providers || [];
    renderProviderList(allProviders);
}

/**
 * 渲染提供商列表
 * @param {Provider[]} providers - 提供商列表
 * @returns {void}
 */
function renderProviderList(providers) {
    const providerListDiv = document.getElementById('providerList');
    const currentValue = document.getElementById('provider').value;

    providerListDiv.innerHTML = '';

    if (!providers || providers.length === 0) {
        const item = document.createElement('div');
        item.className = 'provider-list-item';
        item.textContent = 'No matching providers';
        item.style.pointerEvents = 'none';
        item.style.opacity = '0.5';
        providerListDiv.appendChild(item);
        return;
    }

    providers.forEach(provider => {
        const item = document.createElement('div');
        item.className = 'provider-list-item';
        if (provider.id === currentValue) {
            item.classList.add('selected');
        }
        item.textContent = `${provider.name} (${provider.id})`;
        item.addEventListener('click', function () {
            const providerInput = document.getElementById('provider');
            providerInput.value = provider.id;
            // 移除错误样式（如果有）
            providerInput.classList.remove('invalid');
            providerListDiv.classList.remove('show');
        });
        providerListDiv.appendChild(item);
    });
}

/**
 * 表单验证
 */
/**
 * 显示全局错误信息
 * @param {string} message - 错误消息
 * @returns {void}
 */
function showGlobalError(message) {
    const banner = document.getElementById('globalErrorBanner');
    const messageSpan = document.getElementById('globalErrorMessage');

    if (banner && messageSpan) {
        messageSpan.textContent = message;
        banner.style.display = 'flex';
        // 自动滚动到顶部以确保用户看到错误提示
        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * 隐藏全局错误信息
 * @returns {void}
 */
function hideGlobalError() {
    const banner = document.getElementById('globalErrorBanner');
    if (banner) {
        banner.style.display = 'none';
    }
}

/**
 * 验证表单数据
 * @returns {boolean} 表单是否有效
 */
function validateForm() {
    const modelId = document.getElementById('modelId').value.trim();
    const modelName = document.getElementById('modelName').value.trim();
    const provider = document.getElementById('provider').value.trim();
    const baseUrl = document.getElementById('baseUrl').value.trim();
    const maxInputTokens = document.getElementById('maxInputTokens').value.trim();
    const maxOutputTokens = document.getElementById('maxOutputTokens').value.trim();

    // 验证必填字段
    if (!modelId) {
        showGlobalError('Please enter Model ID');
        document.getElementById('modelId').focus();
        return false;
    }
    if (!modelName) {
        showGlobalError('Please enter display name');
        document.getElementById('modelName').focus();
        return false;
    }
    if (!provider) {
        showGlobalError('Please enter provider');
        document.getElementById('provider').focus();
        return false;
    }
    if (!baseUrl) {
        showGlobalError('Please enter BASE URL');
        document.getElementById('baseUrl').focus();
        return false;
    }

    // 验证 URL 格式
    if (baseUrl) {
        try {
            const urlObj = new URL(baseUrl);
            if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                showGlobalError('BASE URL must start with http:// or https://');
                document.getElementById('baseUrl').focus();
                return false;
            }
        } catch (e) {
            showGlobalError('BASE URL format is incorrect, please enter a valid URL');
            document.getElementById('baseUrl').focus();
            return false;
        }
    }

    // 验证 Token 数量
    if (!maxInputTokens || isNaN(parseInt(maxInputTokens)) || parseInt(maxInputTokens) <= 0) {
        showGlobalError('Input token must be a number greater than 0');
        document.getElementById('maxInputTokens').focus();
        return false;
    }
    if (!maxOutputTokens || isNaN(parseInt(maxOutputTokens)) || parseInt(maxOutputTokens) <= 0) {
        showGlobalError('Output token must be a number greater than 0');
        document.getElementById('maxOutputTokens').focus();
        return false;
    }

    // 验证 JSON 格式
    const customHeaderJson = document.getElementById('customHeader').value.trim();
    if (customHeaderJson && !validateJSON(customHeaderJson)) {
        showGlobalError('Custom HTTP header JSON format is incorrect, must be object type');
        document.getElementById('customHeader').focus();
        return false;
    }

    const extraBodyJson = document.getElementById('extraBody').value.trim();
    if (extraBodyJson && !validateJSON(extraBodyJson)) {
        showGlobalError('Extra request body parameters JSON format is incorrect, must be object type');
        document.getElementById('extraBody').focus();
        return false;
    }

    return true;
}

/**
 * Save model configuration
 * @returns {void}
 */
function saveModel() {
    // Clear previous errors
    hideGlobalError();

    if (!validateForm()) {
        return;
    }

    const modelId = document.getElementById('modelId').value.trim();
    const modelName = document.getElementById('modelName').value.trim();
    const provider = document.getElementById('provider').value.trim();

    if (!modelId || !modelName || !provider) {
        showGlobalError('Please enter all required fields');
        return;
    }

    const tooltipText = document.getElementById('modelTooltip').value.trim();
    const requestModelText = document.getElementById('requestModel').value.trim();
    const baseUrlText = document.getElementById('baseUrl').value.trim();

    const model = {
        id: modelId,
        name: modelName,
        // tooltip: use null to clear (undefined will be ignored when JSON serialize)
        tooltip: tooltipText || null,
        provider: provider,
        // baseUrl: use null to clear
        baseUrl: baseUrlText || null,
        // model: use null to clear
        model: requestModelText || null,
        sdkMode: document.getElementById('sdkMode').value || 'openai',
        maxInputTokens: parseInt(document.getElementById('maxInputTokens').value) || 12800,
        maxOutputTokens: parseInt(document.getElementById('maxOutputTokens').value) || 8192,
        capabilities: {
            toolCalling: document.getElementById('toolCalling').checked,
            imageInput: document.getElementById('imageInput').checked
        },
        outputThinking: document.getElementById('outputThinking').checked,
        includeThinking: document.getElementById('includeThinking').checked
    };

    const customHeaderText = document.getElementById('customHeader').value.trim();
    const customHeader = parseJSON(customHeaderText);
    // Explicitly set customHeader, use null to clear (undefined will be ignored when JSON serialize)
    model.customHeader = customHeader || null;

    const extraBodyText = document.getElementById('extraBody').value.trim();
    const extraBody = parseJSON(extraBodyText);
    // Explicitly set extraBody, use null to clear
    model.extraBody = extraBody || null;

    if (!model.id || !model.name || !model.provider) {
        showGlobalError('Model configuration is incomplete, please try again');
        return;
    }

    vscode.postMessage({
        command: 'save',
        model: model
    });
}

/**
 * Cancel editing
 * @returns {void}
 */
function cancelEdit() {
    vscode.postMessage({
        command: 'cancel'
    });
}

/**
 * Delete model
 * @returns {void}
 */
function deleteModel() {
    // Send delete request to VSCode side, VSCode will show confirmation dialog
    vscode.postMessage({
        command: 'delete',
        modelId: document.getElementById('modelId').value.trim(),
        modelName: document.getElementById('modelName').value.trim()
    });
}
