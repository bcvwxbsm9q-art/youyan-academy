/**
 * 数据实时同步模块
 * 实现跨页面、跨标签页的数据实时联动
 * 使用 localStorage 事件机制广播数据变更
 */

(function() {
  'use strict';

  // 同步频道名称
  const SYNC_CHANNEL = 'youyan_academy_sync';
  const SYNC_TIME_KEY = 'data_sync_time';

  // 数据变更事件类型
  const EventTypes = {
    COURSES: 'courses',
    CATEGORIES: 'categories',
    LECTURERS: 'lecturers',
    NOTICES: 'notices',
    BANNERS: 'banners',
    ALL: 'all'
  };

  /**
   * 广播数据变更事件
   * @param {string} type - 变更的数据类型
   * @param {object} data - 变更的数据（可选）
   */
  function broadcast(type, data = null) {
    const event = {
      type: type,
      data: data,
      timestamp: Date.now(),
      source: window.location.pathname
    };
    localStorage.setItem(SYNC_TIME_KEY, Date.now().toString());
    localStorage.setItem(SYNC_CHANNEL, JSON.stringify(event));
    // 触发 storage 事件
    window.dispatchEvent(new StorageEvent('storage', {
      key: SYNC_CHANNEL,
      newValue: JSON.stringify(event)
    }));
  }

  /**
   * 监听数据变更事件
   * @param {string} type - 要监听的数据类型，或 '*' 监听所有，'all' 监听所有事件
   * @param {function} callback - 回调函数
   * @returns {function} 取消监听函数
   */
  function listen(type, callback) {
    const handler = function(e) {
      if (e.key === SYNC_CHANNEL && e.newValue) {
        try {
          const event = JSON.parse(e.newValue);
          // 忽略自己发送的事件（同一页面内不响应自己广播的事件）
          if (event.source === window.location.pathname) return;
          // 检查是否匹配类型：支持 '*'、'all' 和具体类型
          // 监听 '*' 或 'all' 时响应所有事件
          // 监听具体类型时只响应匹配的事件
          const matchAll = (type === '*' || type === EventTypes.ALL || type === 'all');
          const matchType = (event.type === type);
          const eventIsAll = (event.type === EventTypes.ALL || event.type === 'all');
          
          if (matchAll || matchType || eventIsAll) {
            callback(event);
          }
        } catch (err) {
          console.error('解析同步事件失败:', err);
        }
      }
    };

    window.addEventListener('storage', handler);
    
    // 返回取消监听函数
    return function() {
      window.removeEventListener('storage', handler);
    };
  }

  /**
   * 轮询检查数据变更（备用机制）
   * @param {string} type - 数据类型
   * @param {function} checkFn - 检查函数，返回 true 表示数据有变化
   * @param {function} callback - 回调函数
   * @param {number} interval - 轮询间隔（毫秒）
   * @returns {object} 控制器 { stop: function, start: function }
   */
  function poll(type, checkFn, callback, interval = 3000) {
    let lastValue = null;
    let timerId = null;
    let isRunning = false;

    const stop = function() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      isRunning = false;
    };

    const start = function() {
      if (isRunning) return;
      isRunning = true;
      timerId = setInterval(async function() {
        try {
          const currentValue = await checkFn();
          const hasChanged = JSON.stringify(currentValue) !== JSON.stringify(lastValue);
          if (hasChanged) {
            lastValue = currentValue;
            callback(currentValue);
            broadcast(type);
          }
        } catch (err) {
          console.error('轮询检查失败:', err);
        }
      }, interval);
    };

    start();

    return { stop, start, isRunning: function() { return isRunning; } };
  }

  /**
   * 简化版轮询 - 直接比较数组长度或关键字段
   */
  function createSimplePoller(type, fetchFn, getKey, interval = 5000) {
    let cache = new Map();
    let timerId = null;

    const start = function(onChange) {
      stop();
      
      // 初始化缓存
      fetchFn().then(data => {
        if (Array.isArray(data)) {
          data.forEach(item => cache.set(getKey(item), item));
        }
      });

      timerId = setInterval(async function() {
        try {
          const newData = await fetchFn();
          if (!Array.isArray(newData)) return;

          let changed = false;
          const newCache = new Map();

          newData.forEach(item => {
            const key = getKey(item);
            newCache.set(key, item);
            if (!cache.has(key)) {
              changed = true; // 新增
            } else if (JSON.stringify(cache.get(key)) !== JSON.stringify(item)) {
              changed = true; // 修改
            }
          });

          // 检查删除
          cache.forEach((_, key) => {
            if (!newCache.has(key)) changed = true;
          });

          if (changed) {
            cache = newCache;
            onChange(newData);
            broadcast(type);
          }
        } catch (err) {
          console.error('轮询失败:', err);
        }
      }, interval);
    };

    const stop = function() {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    return { start, stop };
  }

  /**
   * 页面可见性变化监听 - 页面重新可见时刷新数据
   */
  function onPageVisible(callback) {
    const handler = function() {
      if (document.visibilityState === 'visible') {
        callback();
        broadcast(EventTypes.ALL); // 通知其他页面刷新
      }
    };
    document.addEventListener('visibilitychange', handler);
    return function() {
      document.removeEventListener('visibilitychange', handler);
    };
  }

  /**
   * 获取上次同步时间
   */
  function getLastSyncTime() {
    const time = localStorage.getItem(SYNC_TIME_KEY);
    return time ? parseInt(time) : null;
  }

  // 导出到全局
  window.DataSync = {
    EventTypes,
    broadcast,
    listen,
    poll,
    createSimplePoller,
    onPageVisible,
    getLastSyncTime
  };

  // 自动初始化
  console.log('[DataSync] 实时同步模块已加载');
})();
