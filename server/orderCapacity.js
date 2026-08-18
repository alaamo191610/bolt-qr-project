import { ApiError, ERROR_CODES } from './errors.js';

export const PUBLIC_ORDER_OPEN_LIMIT = 4;
export const PUBLIC_ORDER_TABLE_OPEN_LIMIT = 4;
export const PUBLIC_ORDER_OPEN_STATUSES = Object.freeze(['pending', 'preparing', 'ready']);

export const enforcePublicOrderCapacity = async (db, {
  organizationId,
  tableId,
  tableSessionId,
}) => {
  const sessionOpenOrderCount = await db.order.count({
    where: {
      organization_id: organizationId,
      table_id: tableId,
      table_session_id: tableSessionId,
      status: { in: PUBLIC_ORDER_OPEN_STATUSES },
    },
  });

  const tableOpenOrderCount = await db.order.count({
    where: {
      organization_id: organizationId,
      table_id: tableId,
      table_session_id: { not: null },
      status: { in: PUBLIC_ORDER_OPEN_STATUSES },
    },
  });

  const rejectAtCapacity = (message, openOrderCount, orderLimit) => {
    const error = new ApiError(message, {
      status: 409,
      code: ERROR_CODES.ORDER_LIMIT_REACHED,
    });
    error.telemetryCounters = { openOrderCount, orderLimit };
    throw error;
  };

  if (tableOpenOrderCount >= PUBLIC_ORDER_TABLE_OPEN_LIMIT) {
    rejectAtCapacity(
      'This table already has the maximum number of open orders',
      tableOpenOrderCount,
      PUBLIC_ORDER_TABLE_OPEN_LIMIT,
    );
  }

  if (sessionOpenOrderCount >= PUBLIC_ORDER_OPEN_LIMIT) {
    rejectAtCapacity(
      'This table session already has the maximum number of open orders',
      sessionOpenOrderCount,
      PUBLIC_ORDER_OPEN_LIMIT,
    );
  }

  return {
    openOrderCount: tableOpenOrderCount,
    limit: PUBLIC_ORDER_TABLE_OPEN_LIMIT,
    sessionOpenOrderCount,
    tableOpenOrderCount,
  };
};
