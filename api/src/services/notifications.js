export async function sendNotification({ recipientId, type, message, studentId }) {
  console.log('[Notification]', { recipientId, type, message, studentId, timestamp: new Date().toISOString() });
  return { success: true, delivered: true };
}
