// Realtime topic names. Shared by server and browser.
// Topics carry only a version number, never data, so knowing a topic name reveals nothing.
export const topics = {
  event: (eventId: string) => `event-${eventId}`,
  company: (companyId: string) => `company-${companyId}`,
  activity: (eventId: string) => `activity-${eventId}`,
  poll: (eventId: string) => `poll-${eventId}`,
};
export const TOPIC_PATTERN = /^(event|company|activity|poll)-[0-9a-f-]{36}$/;
