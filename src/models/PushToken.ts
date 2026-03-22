/**
 * PushToken model for storing user push notification tokens
 */
export interface PushToken {
  id?: string;
  token: string;
  deviceId?: string;
  createdAt: Date;
  lastUsed: Date;
  isActive: boolean;
  /** Whether to send Baro arrival notifications to this device (defaults to true) */
  notifyArrival?: boolean;
  /** Whether to send Baro departure notifications to this device (defaults to true) */
  notifyDeparture?: boolean;
}

export interface CreatePushTokenDto {
  token: string;
  deviceId?: string;
  /** Whether to send Baro arrival notifications to this device (defaults to true) */
  notifyArrival?: boolean;
  /** Whether to send Baro departure notifications to this device (defaults to true) */
  notifyDeparture?: boolean;
}
