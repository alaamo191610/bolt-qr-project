export const POS_PERMISSIONS = Object.freeze({
  READ: 'pos:read',
  CHECK_WRITE: 'check:write',
  CHECK_VOID: 'check:void',
  ITEM_VOID: 'item:void',
  PAYMENT_WRITE: 'payment:write',
  REFUND_WRITE: 'refund:write',
  SHIFT_OWN: 'shift:own',
  SHIFT_MANAGE: 'shift:manage',
  CASH_MANAGE: 'cash:manage',
  TABLE_MANAGE: 'table:manage',
  EMPLOYEE_MANAGE: 'employee:manage',
});

export const hasPermission = (permissions, required) => {
  const granted = Array.isArray(permissions) ? permissions : [];
  if (granted.includes('pos:*') || granted.includes(required)) return true;
  return required === POS_PERMISSIONS.SHIFT_OWN && granted.includes(POS_PERMISSIONS.SHIFT_MANAGE);
};

export const requirePermission = permission => (req, res, next) => {
  if (req.pos?.kind !== 'employee' || !hasPermission(req.pos.permissions, permission)) {
    return res.status(403).json({ error: `Permission required: ${permission}` });
  }
  next();
};
