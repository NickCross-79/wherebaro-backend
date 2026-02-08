/**
 * Job to check Baro status and send notifications if he has arrived
 */
import { collections, connectToDatabase } from '../db/database.service';
import { sendBaroArrivalNotification, sendBaroLeavingSoonNotification } from '../services/notificationService';

interface WarframestatBaroResponse {
  id: string;
  activation: string;
  expiry: string;
  character: string;
  location: string;
  inventory: any[];
  active: boolean;
}

interface BaroStatus {
  isActive: boolean;
  location: string;
  activation: string;
  expiry: string;
  lastChecked: Date;
  departureWarningSent?: boolean;
}

/**
 * Check if Baro status has changed and send notifications
 */
export async function checkBaroStatusAndNotify(): Promise<{ statusChanged: boolean; notificationsSent: boolean }> {
  try {
    await connectToDatabase();

    // Fetch current Baro status from Warframestat API
    console.log('[Baro Notification] Checking Baro status...');
    const response = await fetch('https://api.warframestat.us/pc/voidTrader/');
    const baroData = await response.json() as WarframestatBaroResponse;

    const now = new Date();
    const activation = new Date(baroData.activation);
    const expiry = new Date(baroData.expiry);
    
    // Determine if Baro is currently active
    const isBaroActive = now >= activation && now < expiry;

    // Get last known status from database
    const lastStatus = await collections.current?.findOne({ type: 'baro-notification-status' }) as BaroStatus | null;

    const currentStatus: BaroStatus = {
      isActive: isBaroActive,
      location: baroData.location,
      activation: baroData.activation,
      expiry: baroData.expiry,
      lastChecked: now,
    };

    // Update status in database
    await collections.current?.updateOne(
      { type: 'baro-notification-status' },
      { $set: currentStatus },
      { upsert: true }
    );

    // Reset departure warning flag when Baro leaves
    if (!isBaroActive && lastStatus?.departureWarningSent) {
      await collections.current?.updateOne(
        { type: 'baro-notification-status' },
        { $set: { departureWarningSent: false } }
      );
    }

    // Check if Baro just arrived (wasn't active before, but is now)
    const baroJustArrived = isBaroActive && (!lastStatus || !lastStatus.isActive);

    if (baroJustArrived) {
      console.log(`[Baro Notification] Baro arrived at ${baroData.location}! Sending notifications...`);
      await sendBaroArrivalNotification(baroData.location);
      return { statusChanged: true, notificationsSent: true };
    }

    // Check if Baro is leaving within 3 hours and we haven't warned yet
    const DEPARTURE_WARNING_MS = 3 * 60 * 60 * 1000; // 3 hours
    const msUntilExpiry = expiry.getTime() - now.getTime();
    const isDepartingSoon = isBaroActive && msUntilExpiry > 0 && msUntilExpiry <= DEPARTURE_WARNING_MS;

    if (isDepartingSoon && !lastStatus?.departureWarningSent) {
      const hoursLeft = Math.round(msUntilExpiry / (60 * 60 * 1000));
      console.log(`[Baro Notification] Baro leaving in ~${hoursLeft}h — sending departure warning...`);
      await sendBaroLeavingSoonNotification(hoursLeft || 1);
      await collections.current?.updateOne(
        { type: 'baro-notification-status' },
        { $set: { departureWarningSent: true } }
      );
      return { statusChanged: false, notificationsSent: true };
    }

    console.log(`[Baro Notification] Status: ${isBaroActive ? 'Active at ' + baroData.location : 'Inactive'} | Next: ${baroData.activation}`);
    return { statusChanged: false, notificationsSent: false };

  } catch (error) {
    console.error('[Baro Notification] Error:', error);
    throw error;
  }
}
