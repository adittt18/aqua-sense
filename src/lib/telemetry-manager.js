/**
 * AquaSense Telemetry Manager
 * Deterministic multi-tank alert state machine with hysteresis debounce.
 *
 * @license MIT
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TelemetryManager = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this, function () {
  "use strict";

  const CRITICAL_PCT = 20; // Enter ALARM below this threshold
  const RECOVER_PCT = 25;  // Recover to NORMAL at or above this threshold

  const STATES = Object.freeze({
    NORMAL: "NORMAL",
    ALARM: "ALARM"
  });

  /**
   * TelemetryManager constructor
   * @param {Object} [options]
   * @param {Function} [options.onAlarm] - Called when a tank enters ALARM state
   * @param {Function} [options.onClear] - Called when a tank recovers to NORMAL state
   * @param {number} [options.criticalPct=20] - Critical alarm threshold
   * @param {number} [options.recoverPct=25] - Hysteresis recovery threshold
   */
  function TelemetryManager(options) {
    options = options || {};
    this.criticalPct = typeof options.criticalPct === "number" && isFinite(options.criticalPct) ? options.criticalPct : CRITICAL_PCT;
    this.recoverPct = typeof options.recoverPct === "number" && isFinite(options.recoverPct) ? options.recoverPct : RECOVER_PCT;
    this.onAlarm = typeof options.onAlarm === "function" ? options.onAlarm : function () {};
    this.onClear = typeof options.onClear === "function" ? options.onClear : function () {};
    this.tanks = {};
    this.alarmCount = 0;
  }

  TelemetryManager.STATES = STATES;
  TelemetryManager.CRITICAL_PCT = CRITICAL_PCT;
  TelemetryManager.RECOVER_PCT = RECOVER_PCT;

  /**
   * Process incoming tank telemetry reading
   * Deterministically transitions per-tank state machine with debouncing.
   *
   * @param {string} tankId - Identifier for the tank
   * @param {number} level - Current liquid level percentage
   * @returns {Object|null} The updated tank state object
   */
  TelemetryManager.prototype.update = function (tankId, level) {
    if (tankId == null || tankId === "") return null;
    const id = String(tankId);

    const numericLevel = typeof level === "number" ? level : (typeof level === "string" && level.trim() !== "" ? Number(level) : NaN);
    if (!isFinite(numericLevel)) return null;

    const tank = this.tanks[id] || (this.tanks[id] = {
      state: STATES.NORMAL,
      level: 100,
      lastUpdated: null,
      transitionCount: 0
    });

    tank.level = numericLevel;
    tank.lastUpdated = Date.now();

    // Deterministic state transition with hysteresis debounce
    if (tank.state === STATES.NORMAL && numericLevel < this.criticalPct) {
      tank.state = STATES.ALARM;
      tank.transitionCount++;
      this.alarmCount++;
      try {
        this.onAlarm(id, numericLevel);
      } catch (err) {
        if (typeof console !== "undefined" && console.error) {
          console.error("[TelemetryManager] Error in onAlarm handler for " + id + ":", err);
        }
      }
    } else if (tank.state === STATES.ALARM && numericLevel >= this.recoverPct) {
      tank.state = STATES.NORMAL;
      tank.transitionCount++;
      try {
        this.onClear(id, numericLevel);
      } catch (err) {
        if (typeof console !== "undefined" && console.error) {
          console.error("[TelemetryManager] Error in onClear handler for " + id + ":", err);
        }
      }
    }

    return tank;
  };

  /**
   * Get current state of a given tank
   * @param {string} tankId
   * @returns {string} STATES.NORMAL or STATES.ALARM
   */
  TelemetryManager.prototype.getState = function (tankId) {
    const tank = this.tanks[tankId];
    return tank ? tank.state : STATES.NORMAL;
  };

  /**
   * Get level reading of a given tank
   * @param {string} tankId
   * @returns {number|null}
   */
  TelemetryManager.prototype.getLevel = function (tankId) {
    const tank = this.tanks[tankId];
    return tank ? tank.level : null;
  };

  /**
   * Get snapshot of all tank telemetry states
   * @returns {Object}
   */
  TelemetryManager.prototype.getSnapshot = function () {
    const snapshot = {};
    for (const key in this.tanks) {
      if (Object.prototype.hasOwnProperty.call(this.tanks, key)) {
        snapshot[key] = Object.assign({}, this.tanks[key]);
      }
    }
    return snapshot;
  };

  /**
   * Reset manager state
   */
  TelemetryManager.prototype.reset = function () {
    this.tanks = {};
    this.alarmCount = 0;
  };

  return TelemetryManager;
});
