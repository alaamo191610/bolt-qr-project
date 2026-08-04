export const writeAuditEvent = (db, context, event) => db.auditEvent.create({
  data: {
    organization_id: context.organizationId,
    branch_id: context.branchId || null,
    actor_admin_id: context.kind === 'admin' ? context.adminId : null,
    actor_employee_id: context.kind === 'employee' ? context.employeeId : null,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId ? String(event.entityId) : null,
    metadata: event.metadata || {},
  },
});
