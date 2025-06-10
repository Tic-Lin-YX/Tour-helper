// DOM 元素
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const historyList = document.getElementById('history-list');
const newChatBtn = document.getElementById('new-chat-btn');
const currentUserIdElement = document.getElementById('current-user-id');

// 应用状态
let currentUserId = 1; // 当前用户ID
let isWaitingForResponse = false; // 是否正在等待AI响应
let userHistory = []; // 用户历史记录列表
let userMessages = {}; // 用户消息记录缓存 {userId: [{content, role, timestamp}]}

// 本地存储键名
const USER_HISTORY_KEY = 'ai_chat_user_history';
const USER_MESSAGES_KEY = 'ai_chat_user_messages_';

/**
 * 页面加载初始化
 */
document.addEventListener('DOMContentLoaded', () => {
    // 从URL获取用户ID
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('userId')) {
        currentUserId = parseInt(urlParams.get('userId'));
        currentUserIdElement.textContent = currentUserId;
    }
    
    // 初始化事件监听器
    initEventListeners();
    
    // 先加载所有用户历史列表 (从数据库)
    loadAllUsersFromDatabase();
    
    // 加载当前用户的聊天记录 (从数据库)
    loadCurrentUserMessagesFromDatabase();
});

/**
 * 初始化各种事件监听器
 */
function initEventListeners() {
    // 发送按钮点击事件
    sendButton.addEventListener('click', sendMessage);
    
    // 输入框按键事件（按Enter发送消息，Shift+Enter换行）
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
        
        // 自动调整输入框高度
        setTimeout(() => {
            messageInput.style.height = 'auto';
            messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
        }, 0);
    });
    
    // 创建新会话按钮
    newChatBtn.addEventListener('click', startNewChat);
    
    // 窗口大小调整事件
    window.addEventListener('resize', () => {
        scrollToBottom();
    });
}

/**
 * 从数据库加载所有用户
 */
function loadAllUsersFromDatabase() {
    // 显示加载状态
    historyList.innerHTML = '<div class="loading-history">加载历史记录...</div>';
    
    // 从后端API获取所有用户ID
    fetch('/api/users')
        .then(response => {
            if (!response.ok) {
                throw new Error('无法获取用户列表');
            }
            return response.json();
        })
        .then(data => {
            if (data && data.userIds && data.userIds.length > 0) {
                // 为每个用户ID创建一个历史记录项
                const promises = data.userIds.map(userId => {
                    return fetch(`/api/messages?userId=${userId}`)
                        .then(response => response.json())
                        .then(data => {
                            // 找到最新的消息作为历史预览
                            let lastMessage = '新建聊天';
                            if (data.messages && data.messages.length > 0) {
                                // 按时间排序，找到最新的用户消息
                                const userMessages = data.messages
                                    .filter(msg => msg.role === 'user')
                                    .sort((a, b) => b.timestamp - a.timestamp);
                                
                                if (userMessages.length > 0) {
                                    lastMessage = userMessages[0].content;
                                }
                            }
                            
                            return {
                                userId: userId,
                                title: `聊天 ${userId}`,
                                lastMessage: lastMessage,
                                timestamp: Date.now() - (Math.random() * 100000) // 随机时间戳以分散显示
                            };
                        })
                        .catch(() => {
                            // 如果获取消息失败，返回默认的历史项
                            return {
                                userId: userId,
                                title: `聊天 ${userId}`,
                                lastMessage: '无法加载聊天记录',
                                timestamp: Date.now() - (Math.random() * 100000)
                            };
                        });
                });
                
                // 等待所有请求完成
                Promise.all(promises)
                    .then(historyItems => {
                        userHistory = historyItems;
                        renderUserHistory();
                        
                        // 保存到本地存储 (作为备份)
                        saveUserHistory();
                    })
                    .catch(error => {
                        console.error('处理用户历史记录失败:', error);
                        loadUserHistoryFromLocalStorage();
                    });
            } else {
                // 如果没有用户ID，从本地存储加载
                loadUserHistoryFromLocalStorage();
            }
        })
        .catch(error => {
            console.error('获取用户列表失败:', error);
            loadUserHistoryFromLocalStorage();
        });
}

/**
 * 从本地存储加载用户历史列表 (备用方案)
 */
function loadUserHistoryFromLocalStorage() {
    try {
        // 从本地存储获取历史记录
        const savedHistory = localStorage.getItem(USER_HISTORY_KEY);
        if (savedHistory) {
            userHistory = JSON.parse(savedHistory);
        } else {
            // 如果没有历史记录，初始化默认历史
            userHistory = [
                { userId: 1, title: "初始聊天", lastMessage: "欢迎使用AI聊天助手", timestamp: Date.now() }
            ];
            // 保存到本地存储
            saveUserHistory();
        }
    } catch (error) {
        console.error('加载历史记录失败:', error);
        // 使用默认数据
        userHistory = [
            { userId: 1, title: "初始聊天", lastMessage: "欢迎使用AI聊天助手", timestamp: Date.now() }
        ];
    }
    
    // 确保当前用户在历史记录中
    ensureCurrentUserInHistory();
    
    // 渲染用户历史
    renderUserHistory();
}

/**
 * 确保当前用户在历史记录中
 */
function ensureCurrentUserInHistory() {
    // 检查当前用户是否已在历史记录中
    const existingUser = userHistory.find(h => h.userId == currentUserId);
    
    if (!existingUser) {
        // 如果不在，添加到历史
        userHistory.push({
            userId: currentUserId,
            title: `聊天 ${currentUserId}`,
            lastMessage: "新建聊天",
            timestamp: Date.now()
        });
        
        // 保存到本地存储
        saveUserHistory();
    }
}

/**
 * 保存用户历史到本地存储
 */
function saveUserHistory() {
    try {
        localStorage.setItem(USER_HISTORY_KEY, JSON.stringify(userHistory));
    } catch (error) {
        console.error('保存历史记录失败:', error);
    }
}

/**
 * 保存当前用户的消息记录
 */
function saveUserMessages() {
    try {
        const storageKey = USER_MESSAGES_KEY + currentUserId;
        if (userMessages[currentUserId] && userMessages[currentUserId].length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(userMessages[currentUserId]));
        }
    } catch (error) {
        console.error('保存用户消息失败:', error);
    }
}

/**
 * 渲染用户历史列表
 */
function renderUserHistory() {
    historyList.innerHTML = '';
    
    if (userHistory.length === 0) {
        const emptyItem = document.createElement('div');
        emptyItem.className = 'history-item empty';
        emptyItem.innerHTML = '暂无历史记录';
        historyList.appendChild(emptyItem);
        return;
    }
    
    // 按时间倒序排列
    const sortedHistory = [...userHistory].sort((a, b) => b.timestamp - a.timestamp);
    
    sortedHistory.forEach(history => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        // 高亮当前使用的用户ID
        if (history.userId == currentUserId) {
            historyItem.classList.add('active');
        }
        
        // 格式化时间
        const date = new Date(history.timestamp);
        const formattedDate = `${date.getMonth() + 1}月${date.getDate()}日`;
        
        // 内容部分（左侧）
        const contentDiv = document.createElement('div');
        contentDiv.className = 'history-item-content';
        contentDiv.innerHTML = `
            <div class="history-title">${history.title || '未命名对话'}</div>
            <div class="history-preview">${history.lastMessage || ''}</div>
            <div class="history-date">${formattedDate}</div>
        `;
        
        // 三点按钮部分（右侧）
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'history-item-actions';
        
        // 创建三点按钮
        const actionBtn = document.createElement('button');
        actionBtn.className = 'history-action-btn';
        actionBtn.textContent = '⋮';  // 垂直三点符号
        actionsDiv.appendChild(actionBtn);
        
        // 创建操作菜单
        const actionMenu = document.createElement('div');
        actionMenu.className = 'history-action-menu';
        
        // 添加删除选项
        const deleteItem = document.createElement('div');
        deleteItem.className = 'history-action-item delete';
        deleteItem.textContent = '删除';
        actionMenu.appendChild(deleteItem);
        
        // 将菜单添加到操作区域
        actionsDiv.appendChild(actionMenu);
        
        // 组合左右两部分
        historyItem.appendChild(contentDiv);
        historyItem.appendChild(actionsDiv);
        
        // 保存用户ID到元素数据
        historyItem.dataset.userId = history.userId;
        
        // 为内容区域添加点击事件（切换到该用户）
        contentDiv.addEventListener('click', () => switchToUser(history.userId));
        
        // 为三点按钮添加点击事件（显示/隐藏菜单）
        actionBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // 阻止事件冒泡
            // 关闭其他所有菜单
            document.querySelectorAll('.history-action-menu.show').forEach(menu => {
                if (menu !== actionMenu) {
                    menu.classList.remove('show');
                }
            });
            // 切换当前菜单显示状态
            actionMenu.classList.toggle('show');
        });
        
        // 为删除选项添加点击事件
        deleteItem.addEventListener('click', (event) => {
            event.stopPropagation(); // 阻止事件冒泡
            deleteUserHistory(history.userId);
        });
        
        historyList.appendChild(historyItem);
    });
    
    // 点击页面其他区域关闭所有菜单
    document.addEventListener('click', () => {
        document.querySelectorAll('.history-action-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
    });
}

/**
 * 从数据库加载当前用户的聊天记录
 */
function loadCurrentUserMessagesFromDatabase() {
    clearChatMessages();
    
    // 显示加载中提示
    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'loading-message';
    loadingMessage.textContent = '加载聊天记录中...';
    chatMessages.appendChild(loadingMessage);
    
    // 从后端API获取当前用户的聊天记录
    fetch(`/api/messages?userId=${currentUserId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('无法获取聊天记录');
            }
            return response.json();
        })
        .then(data => {
            // 移除加载提示
            clearChatMessages();
            
            // 处理从数据库获取的消息
            if (data && data.messages && data.messages.length > 0) {
                // 只过滤掉包含预设词的系统消息
                const filteredMessages = data.messages.filter(msg => 
                    msg.role !== 'system' && 
                    !(msg.content.includes('福州旅游规划小助手') && msg.content.includes('AI 驱动的本地旅游问答系统'))
                );
                
                // 保存消息到本地缓存
                userMessages[currentUserId] = filteredMessages;
                
                // 显示消息
                filteredMessages.forEach(msg => {
                    addMessageToChat(msg.content, msg.role, false, false);
                });
                
                // 更新UI
                scrollToBottom();
                console.log(`已从${data.source || "未知来源"}加载 ${filteredMessages.length} 条消息`);
            } else {
                // 如果没有历史记录，显示欢迎消息
                showWelcomeMessage();
            }
        })
        .catch(error => {
            console.error('加载聊天记录失败:', error);
            
            // 清除加载提示
            clearChatMessages();
            
            // 尝试从本地存储加载
            loadUserMessagesFromLocalStorage();
        });
}

/**
 * 从本地存储加载当前用户的聊天记录 (备用方案)
 */
function loadUserMessagesFromLocalStorage() {
    try {
        const storageKey = USER_MESSAGES_KEY + currentUserId;
        const savedMessages = localStorage.getItem(storageKey);
        
        if (savedMessages) {
            // 如果存在本地消息记录
            const messages = JSON.parse(savedMessages);
            
            // 只过滤包含预设词的系统消息
            const filteredMessages = messages.filter(msg => 
                msg.role !== 'system' && 
                !(msg.content.includes('福州旅游规划小助手') && msg.content.includes('AI 驱动的本地旅游问答系统'))
            );
            
            userMessages[currentUserId] = filteredMessages;
            
            // 显示历史消息
            if (filteredMessages.length > 0) {
                filteredMessages.forEach(msg => {
                    addMessageToChat(msg.content, msg.role, false, false);
                });
                scrollToBottom();
                console.log(`已从本地存储加载 ${filteredMessages.length} 条消息`);
                return;
            }
        }
        
        // 如果没有本地消息记录，显示欢迎消息
        showWelcomeMessage();
    } catch (error) {
        console.error('从本地存储加载消息失败:', error);
        showWelcomeMessage();
    }
}

/**
 * 显示欢迎消息
 */
function showWelcomeMessage() {
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'welcome-message';
    welcomeMessage.innerHTML = '<h3>欢迎使用AI聊天助手</h3><p>每个用户ID代表一个独立的聊天记录</p><p>请在下方输入框中输入您的问题</p>';
    chatMessages.appendChild(welcomeMessage);
    scrollToBottom();
}

/**
 * 切换到特定用户的聊天记录
 */
function switchToUser(userId) {
    if (isWaitingForResponse || userId == currentUserId) return;
    
    // 保存当前用户的消息记录
    saveUserMessages();
    
    // 跳转到指定用户ID的页面
    window.location.href = `/chat?userId=${userId}`;
}

/**
 * 开始新会话（创建新用户ID）
 */
function startNewChat() {
    if (isWaitingForResponse) return;
    
    // 保存当前用户的消息记录
    saveUserMessages();
    
    // 生成新的用户ID，比所有现有ID大1
    let maxUserId = 0;
    userHistory.forEach(history => {
        if (history.userId > maxUserId) {
            maxUserId = history.userId;
        }
    });
    const newUserId = maxUserId + 1;
    
    // 添加到历史记录
    userHistory.push({
        userId: newUserId,
        title: `新聊天 ${newUserId}`,
        lastMessage: "新建聊天",
        timestamp: Date.now()
    });
    
    // 保存到本地存储
    saveUserHistory();
    
    // 跳转到新用户的页面
    window.location.href = `/chat?userId=${newUserId}`;
}

/**
 * 清空聊天消息区域
 */
function clearChatMessages() {
    chatMessages.innerHTML = '';
}

/**
 * 发送消息到后端
 */
function sendMessage() {
    const message = messageInput.value.trim();
    
    if (message === '' || isWaitingForResponse) {
        return;
    }
    
    // 添加用户消息到聊天区域
    addMessageToChat(message, 'user', false, true);
    
    // 清空输入框
    messageInput.value = '';
    messageInput.style.height = 'auto';
    
    // 显示正在输入指示器
    showTypingIndicator();
    
    // 设置状态为等待响应
    isWaitingForResponse = true;
    
    // 滚动到底部
    scrollToBottom();
    
    // 调用后端API (使用流式响应)
    // 注意: 这里直接使用currentUserId作为参数，不再需要conversationId
    const apiUrl = `/ai/memoryId_stream_chat?message=${encodeURIComponent(message)}&userId=${currentUserId}`;
    
    // 使用Fetch API获取流式响应
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('API请求失败');
            }
            
            // 移除输入指示器
            removeTypingIndicator();
            
            // 创建AI回复消息容器
            const assistantMessage = document.createElement('div');
            assistantMessage.className = 'message assistant';
            
            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';
            assistantMessage.appendChild(messageContent);
            
            chatMessages.appendChild(assistantMessage);
            
            // 处理流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedResponse = '';
            
            // 读取流数据
            function readStream() {
                reader.read().then(({ done, value }) => {
                    if (done) {
                        // 流结束，更新历史记录
                        updateUserInHistory(message);
                        
                        // 保存AI回复到消息记录
                        if (!userMessages[currentUserId]) {
                            userMessages[currentUserId] = [];
                        }
                        userMessages[currentUserId].push({
                            role: 'assistant',
                            content: accumulatedResponse,
                            timestamp: Date.now()
                        });
                        
                        // 保存消息记录到本地存储
                        saveUserMessages();
                        
                        // 重置状态
                        isWaitingForResponse = false;
                        
                        return;
                    }
                    
                    // 解码流数据
                    const chunk = decoder.decode(value, { stream: true });
                    accumulatedResponse += chunk;
                    
                    // 更新消息显示
                    messageContent.innerHTML = formatMessage(accumulatedResponse);
                    
                    // 滚动到底部
                    scrollToBottom();
                    
                    // 继续读取流
                    readStream();
                }).catch(error => {
                    console.error('读取流失败:', error);
                    messageContent.textContent = '读取响应失败，请稍后再试';
                    isWaitingForResponse = false;
                });
            }
            
            // 开始读取流
            readStream();
        })
        .catch(error => {
            console.error('API请求失败:', error);
            
            // 移除输入指示器
            removeTypingIndicator();
            
            // 显示错误消息
            addMessageToChat('抱歉，无法连接到服务器，请检查网络连接后再试。', 'assistant', true, true);
            
            // 重置状态
            isWaitingForResponse = false;
        });
}

/**
 * 更新历史记录中的用户信息
 */
function updateUserInHistory(lastMessage) {
    // 检查当前用户是否已在历史记录中
    const existingUserIndex = userHistory.findIndex(h => h.userId == currentUserId);
    
    if (existingUserIndex >= 0) {
        // 更新现有记录
        userHistory[existingUserIndex].lastMessage = lastMessage;
        userHistory[existingUserIndex].timestamp = Date.now();
    } else {
        // 添加新记录
        userHistory.push({
            userId: currentUserId,
            title: `聊天 ${currentUserId}`,
            lastMessage: lastMessage,
            timestamp: Date.now()
        });
    }
    
    // 保存到本地存储
    saveUserHistory();
    
    // 更新UI
    renderUserHistory();
}

/**
 * 添加消息到聊天区域
 * @param {string} message 消息内容
 * @param {string} sender 发送者类型 ('user' 或 'assistant')
 * @param {boolean} isError 是否为错误消息
 * @param {boolean} saveToHistory 是否保存到历史记录
 */
function addMessageToChat(message, sender, isError = false, saveToHistory = true) {
    // 过滤掉系统消息和包含预设词的消息
    if (sender === 'system' || 
        (message.includes('福州旅游规划小助手') && message.includes('AI 驱动的本地旅游问答系统'))) {
        return;
    }
    
    // 移除欢迎消息
    const welcomeMessage = chatMessages.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
    
    // 移除加载消息
    const loadingMessage = chatMessages.querySelector('.loading-message');
    if (loadingMessage) {
        loadingMessage.remove();
    }
    
    // 创建消息元素
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}`;
    if (isError) {
        messageElement.classList.add('error');
    }
    
    // 消息内容
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    messageContent.innerHTML = formatMessage(message);
    
    messageElement.appendChild(messageContent);
    chatMessages.appendChild(messageElement);
    
    // 保存到历史记录
    if (saveToHistory) {
        if (!userMessages[currentUserId]) {
            userMessages[currentUserId] = [];
        }
        userMessages[currentUserId].push({
            role: sender,
            content: message,
            timestamp: Date.now()
        });
    }
    
    scrollToBottom();
}

/**
 * 格式化消息内容
 */
function formatMessage(message) {
    // 简单的文本处理，处理换行符
    return message
        .replace(/\n/g, '<br>')
        // 支持简单的代码块
        .replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
}

/**
 * 显示输入指示器
 */
function showTypingIndicator() {
    const indicatorElement = document.createElement('div');
    indicatorElement.className = 'message assistant typing-indicator';
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    const typingElement = document.createElement('div');
    typingElement.className = 'typing';
    
    // 添加3个点
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        typingElement.appendChild(dot);
    }
    
    messageContent.appendChild(typingElement);
    indicatorElement.appendChild(messageContent);
    chatMessages.appendChild(indicatorElement);
    
    scrollToBottom();
}

/**
 * 移除输入指示器
 */
function removeTypingIndicator() {
    const indicator = document.querySelector('.typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

/**
 * 滚动到聊天区域底部
 */
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * 删除指定用户ID的历史记录
 */
function deleteUserHistory(userId) {
    // 防止删除当前正在使用的用户记录
    if (userId == currentUserId && isWaitingForResponse) {
        alert('当前用户正在对话中，无法删除');
        return;
    }
    
    // 确认删除
    if (confirm(`确定要删除此聊天记录吗？此操作不可恢复。`)) {
        // 显示删除中的状态
        const historyItem = document.querySelector(`.history-item[data-user-id="${userId}"]`);
        if (historyItem) {
            historyItem.classList.add('deleting');
        }
        
        // 调用后端API删除用户记录
        fetch(`/api/users/${userId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            console.log('删除结果:', data);
            
            // 无论后端API成功与否，都更新前端状态
            // 从历史记录中删除
            userHistory = userHistory.filter(h => h.userId != userId);
            
            // 删除该用户的消息记录
            delete userMessages[userId];
            localStorage.removeItem(USER_MESSAGES_KEY + userId);
            
            // 保存更新后的历史记录
            saveUserHistory();
            
            // 更新UI
            renderUserHistory();
            
            // 如果删除的是当前用户，跳转到另一个用户或创建新用户
            if (userId == currentUserId) {
                if (userHistory.length > 0) {
                    // 跳转到第一个可用的用户
                    window.location.href = `/chat?userId=${userHistory[0].userId}`;
                } else {
                    // 如果没有用户了，创建新用户
                    startNewChat();
                }
            }
        })
        .catch(error => {
            console.error('删除用户记录失败:', error);
            alert('删除失败，请稍后再试');
            
            // 移除删除中状态
            if (historyItem) {
                historyItem.classList.remove('deleting');
            }
        });
    }
} 