import { ApiError, ERROR_CODES } from './errors.js';

export const PUBLIC_ORDER_OPEN_LIMIT = 3;
export const PUBLIC_ORDER_OPEN_STATUSES = Object.freeze(['pending', 'preparing', 'ready']);

export const enforcePublicOrderCapacity = async (db, {
  organizationId,
  tableId,
  tableSessionId,
}) => {
  const openOrderCount = await db.order.count({
    where: {
      organization_id: organizationId,
      table_id: tableId,
      table_session_id: tableSessionId,
      status: { in: PUBLIC_ORDER_OPEN_STATUSES },
    },
  });

  if (openOrderCount >= PUBLIC_ORDER_OPEN_LIMIT) {
    throw new ApiError('This table session already has the maximum number of open orders', {
      status: 409,
      code: ERROR_CODES.ORDER_LIMIT_REACHED,
    });
  }

  return { openOrderCount, limit: PUBLIC_ORDER_OPEN_LIMIT };
};
