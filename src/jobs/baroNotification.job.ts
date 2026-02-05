/**
 * Job to check Baro status and send notifications if he has arrived
 */
import { collections } from '../db/database.service';
import { sendBaroArrivalNotification } from '../services/notificationService';

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
}

/**
 * Check if Baro status has changed and send notifications
 */
export async function checkBaroStatusAndNotify(): Promise<{ statusChanged: boolean; notificationsSent: boolean }> {
  try {
    // Fetch current Baro status from Warframestat API
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

    // Check if Baro just arrived (wasn't active before, but is now)
    const baroJustArrived = isBaroActive && (!lastStatus || !lastStatus.isActive);

    if (baroJustArrived) {
      console.log(`Baro has arrived at ${baroData.location}! Sending notifications...`);
      await sendBaroArrivalNotification(baroData.location);
      return { statusChanged: true, notificationsSent: true };
    }

    console.log(`Baro status: ${isBaroActive ? 'Active' : 'Inactive'}. No change detected.`);
    return { statusChanged: false, notificationsSent: false };

  } catch (error) {
    console.error('Error checking Baro status:', error);
    throw error;
  }
}
