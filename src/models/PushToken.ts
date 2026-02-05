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
}

export interface CreatePushTokenDto {
  token: string;
  deviceId?: string;
}
