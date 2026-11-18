const mongoose = require("mongoose");
const { releaseExpiredLocks } = require("../Services/inventoryService");

let cronTimer = null;
let isRunning = false;

/**
 * Execute a single sweep of expired stock locks (overlap-safe)
 */
const runLockExpirySweep = async () => {
  if (isRunning) return { skipped: true };
  if (mongoose.connection.readyState !== 1) return { skipped: true, reason: "DB disconnected" };

  isRunning = true;
  try {
    const result = await releaseExpiredLocks();
    if (result.releasedLocks > 0) {
      console.log(
        `[StockLockCron] Released ${result.releasedLocks} expired lock(s) and expired ${result.expiredOrders} pending order(s).`
      );
    }
    return result;
  } catch (err) {
    console.error("[StockLockCron] Sweep error:", err.message);
    return { error: err.message };
  } finally {
    isRunning = false;
  }
};

/**
 * Start recurring lock-expiry cron (default: every 60 seconds)
 */
const startStockLockCron = (intervalMs = 60 * 1000) => {
  if (cronTimer) return cronTimer;

  // Run one initial sweep shortly after startup
  setTimeout(() => {
    runLockExpirySweep();
  }, 5000);

  cronTimer = setInterval(runLockExpirySweep, intervalMs);
  console.log(`[StockLockCron] Scheduled expired stock-lock release every ${Math.round(intervalMs / 1000)}s.`);
  return cronTimer;
};

const stopStockLockCron = () => {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
};

module.exports = {
  startStockLockCron,
  stopStockLockCron,
  runLockExpirySweep,
};
