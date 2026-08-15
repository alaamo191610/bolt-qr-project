import { api } from './api';

// See docs/contracts/organization-membership.md.
export type MemberRole = 'OWNER' | 'MANAGER' | 'STAFF';
export type MemberStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

export interface OrganizationMember {
  userId: string;
  email: string;
  name: string | null;
  role: MemberRole;
  status: MemberStatus;
  defaultBranch: { id: string; name: string } | null;
  createdAt: string;
}

export interface AddMemberInput {
  email: string;
  name?: string;
  password?: string;
  role: MemberRole;
}

export interface UpdateMemberInput {
  role?: MemberRole;
  status?: MemberStatus;
}

export const memberService = {
  async list(): Promise<OrganizationMember[]> {
    return await api.get('/organization/members');
  },

  async add(input: AddMemberInput): Promise<OrganizationMember> {
    return await api.post('/organization/members', input);
  },

  async update(userId: string, input: UpdateMemberInput): Promise<OrganizationMember> {
    return await api.patch(`/organization/members/${userId}`, input);
  },
};
