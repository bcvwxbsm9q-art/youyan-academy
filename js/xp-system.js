/**
 * XP 经验值计算系统 —— PC 端（center.html）与移动端（m/mine.html）共用
 *
 * 设计目标：两端使用「同一份代码、同一套规则」计算等级与经验值，
 * 杜绝各自维护一份 calculateTotalExp / calcXP / LEVEL_CONFIG 导致的漂移。
 *
 * 暴露全局 window.XP，提供：
 *   - LEVEL_CONFIG          等级阈值表（单一权威来源）
 *   - calcXp(stats)        经验值计算（stats: {hours, completed, streak, badges, certificates}）
 *   - getLevelInfo(exp)    根据总经验值解析等级信息
 *   - getExpStorageKey(uid) 经验值持久化 key（两端一致）
 *   - loadPersistedXp(uid) 读取持久化经验值（无则返回 null）
 *   - saveXp(uid, xp)      持久化经验值
 *   - cleanupExpV2()       清理历史 v2 持久化 key
 */
(function () {
  'use strict';

  // ====== 等级阈值表（唯一权威来源，禁止在业务页面重复定义）======
  var LEVEL_CONFIG = [
    { level: 1, name: '新手学员', expRequired: 0 },
    { level: 2, name: '初级学员', expRequired: 100 },
    { level: 3, name: '中级学员', expRequired: 300 },
    { level: 4, name: '高级学员', expRequired: 600 },
    { level: 5, name: '学习达人', expRequired: 1000 },
    { level: 6, name: '探究达人', expRequired: 1500 },
    { level: 7, name: '博学达人', expRequired: 2200 },
    { level: 8, name: '学术先锋', expRequired: 3000 },
    { level: 9, name: '研究学者', expRequired: 4000 },
    { level: 10, name: '资深学者', expRequired: 5500 },
    { level: 11, name: '卓越学者', expRequired: 7500 },
    { level: 12, name: '学术宗师', expRequired: 9999 }
  ];

  /**
   * 计算总经验值（统一规则）
   * 规则：学习时长 1h=5XP · 完成课程 每门5XP · 连续学习 每天1XP · 徽章/证书 每个5XP
   * @param {Object} stats {hours, completed, streak, badges, certificates}
   * @returns {number} 总经验值
   */
  function calcXp(stats) {
    stats = stats || {};
    var hours = Number(stats.hours) || 0;
    var completed = Number(stats.completed) || 0;
    var streak = Number(stats.streak) || 0;
    var badges = Number(stats.badges) || 0;
    var certificates = Number(stats.certificates) || 0;
    return Math.floor(hours * 5) + completed * 5 + streak * 1 + (badges + certificates) * 5;
  }

  /**
   * 根据总经验值解析等级信息
   * @param {number} totalExp
   * @returns {{level:number,name:string,currentExp:number,requiredExp:number,remainingExp:number,totalExp:number}}
   */
  function getLevelInfo(totalExp) {
    totalExp = Number(totalExp) || 0;
    var currentLevel = LEVEL_CONFIG[0];
    var nextLevel = LEVEL_CONFIG[1];
    for (var i = 0; i < LEVEL_CONFIG.length; i++) {
      if (totalExp >= LEVEL_CONFIG[i].expRequired) {
        currentLevel = LEVEL_CONFIG[i];
        nextLevel = LEVEL_CONFIG[i + 1] || LEVEL_CONFIG[i];
      } else {
        break;
      }
    }
    var requiredExp = nextLevel.expRequired - currentLevel.expRequired;
    var currentExp = totalExp - currentLevel.expRequired;
    var remainingExp = nextLevel.expRequired - totalExp;
    var isMax = nextLevel === currentLevel;
    return {
      level: currentLevel.level,
      name: currentLevel.name,
      nextName: isMax ? currentLevel.name : nextLevel.name,
      isMax: isMax,
      currentExp: Math.max(0, currentExp),
      requiredExp: Math.max(1, requiredExp),
      remainingExp: Math.max(0, remainingExp),
      totalExp: totalExp
    };
  }

  // ====== 经验值持久化（Single Source of Truth）======
  function getExpStorageKey(userId) {
    return 'user_total_exp_v3_' + userId;
  }

  function loadPersistedXp(userId) {
    try {
      var v = parseInt(localStorage.getItem(getExpStorageKey(userId)), 10);
      return isNaN(v) ? null : v;
    } catch (e) {
      return null;
    }
  }

  function saveXp(userId, xp) {
    try {
      localStorage.setItem(getExpStorageKey(userId), String(xp));
    } catch (e) {}
  }

  // 清理历史 v2 持久化 key（兼容老用户）
  function cleanupExpV2() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('user_total_exp_v2_') === 0) localStorage.removeItem(keys[i]);
      }
    } catch (e) {}
  }

  window.XP = {
    LEVEL_CONFIG: LEVEL_CONFIG,
    calcXp: calcXp,
    getLevelInfo: getLevelInfo,
    getExpStorageKey: getExpStorageKey,
    loadPersistedXp: loadPersistedXp,
    saveXp: saveXp,
    cleanupExpV2: cleanupExpV2
  };
})();
