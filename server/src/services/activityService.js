const MAX_ACTIVITIES = 500
const activities = []

export function recordActivity({ req, action, entityType, entityId = null, hotel = null, metadata = {} }) {
  const activity = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    action,
    entityType,
    entityId,
    hotelId: hotel?.id || req?.hotel?.id || null,
    hotelName: hotel?.name || req?.hotel?.name || '',
    actorUserId: req?.user?.id || null,
    actorName: req?.user?.full_name || req?.firebaseUser?.name || '',
    actorEmail: req?.user?.email || req?.firebaseUser?.email || '',
    actorRole: req?.user?.role || '',
    ipAddress: req?.ip || '',
    userAgent: req?.header?.('user-agent') || '',
    metadata,
    createdAt: new Date().toISOString(),
  }

  activities.unshift(activity)
  if (activities.length > MAX_ACTIVITIES) activities.length = MAX_ACTIVITIES
  return activity
}

export function listActivities({ hotelId, limit = 200 } = {}) {
  return activities
    .filter((activity) => !hotelId || activity.hotelId === hotelId)
    .slice(0, Math.min(Math.max(Number(limit) || 200, 1), MAX_ACTIVITIES))
}
