import { ApiError, ERROR_CODES } from './errors.js';

export const ORDERING_STATES = Object.freeze(['OPEN', 'PAUSED', 'CLOSED', 'OVERLOADED']);
export const TABLE_ORDERABLE_STATUSES = Object.freeze(['available', 'occupied']);

const availabilityError = (message, code) => new ApiError(message, { status: 409, code });

export const assertPublicOrderAvailable = ({ branch, table, organizationId }) => {
  if (
    !branch
    || branch.organization_id !== organizationId
    || table?.branch_id !== branch.id
  ) {
    throw availabilityError('This table is not available for ordering', ERROR_CODES.TABLE_UNAVAILABLE);
  }
  if (!branch.active || branch.ordering_state === 'CLOSED') {
    throw availabilityError('This restaurant location is closed', ERROR_CODES.RESTAURANT_CLOSED);
  }
  if (branch.ordering_state === 'PAUSED') {
    throw availabilityError('This restaurant location has paused new orders', ERROR_CODES.RESTAURANT_PAUSED);
  }
  if (branch.ordering_state === 'OVERLOADED') {
    throw availabilityError('This restaurant location is temporarily overloaded', ERROR_CODES.RESTAURANT_OVERLOADED);
  }
  if (branch.ordering_state !== 'OPEN' || !TABLE_ORDERABLE_STATUSES.includes(table?.status)) {
    throw availabilityError('This table is not available for ordering', ERROR_CODES.TABLE_UNAVAILABLE);
  }
};

const TELEMETRY_REASON_CODES = new Set([
  ERROR_CODES.RATE_LIMITED,
  ERROR_CODES.ORDER_LIMIT_REACHED,
  ERROR_CODES.RESTAURANT_PAUSED,
  ERROR_CODES.RESTAURANT_CLOSED,
  ERROR_CODES.RESTAURANT_OVERLOADED,
  ERROR_CODES.TABLE_UNAVAILABLE,
]);
const COUNTER_FIELDS = Object.freeze(['openOrderCount', 'orderLimit']);

export const createPublicOrderRejectionTelemetry = ({
  logger = process.env.NODE_ENV === 'test' ? () => {} : line => console.info(line),
} = {}) => ({
  record({ requestId, organizationId, branchId, tableId, reasonCode, counters = {} }) {
    if (!TELEMETRY_REASON_CODES.has(reasonCode)) return false;
    const safeCounters = Object.fromEntries(COUNTER_FIELDS.flatMap(field => {
      const value = Number(counters[field]);
      return Number.isInteger(value) && value >= 0 ? [[field, value]] : [];
    }));
    logger(JSON.stringify({
      event: 'public_order_rejected',
      requestId,
      organizationId,
      branchId: branchId || null,
      tableId,
      reasonCode,
      counters: safeCounters,
    }));
    return true;
  },
});
