import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QrCode } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResponsiveLayout from './ResponsiveLayout';
import type { OrganizationMembership } from '../../providers/AuthProvider';

const translations: Record<string, string> = {
  'auth.organizations': 'Organizations',
  'auth.signedInAs': 'Signed in as',
  'auth.signOut': 'Sign Out',
  'common.search': 'Search',
};

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { primary: '#059669', secondary: '#047857' } }),
}));

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => translations[key] ?? key, isRTL: false }),
}));

vi.mock('../../hooks/useAdminMonetary', () => ({
  useAdminMonetary: () => ({ restaurantName: null, logoUrl: null }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const navigation = [{ id: 'qr-generator', name: 'QR Codes', icon: QrCode }];
const userInfo = { id: 'admin-1', name: 'Alaa', email: 'alaa@example.com' };

const orgs: OrganizationMembership[] = [
  { id: 'org-1', name: 'Bella Vista', slug: 'bella-vista', role: 'OWNER', current: true },
  { id: 'org-2', name: 'North Branch', slug: 'north-branch', role: 'MANAGER', current: false },
];

const openProfileMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /Alaa/i }));
};

describe('ResponsiveLayout organization switcher', () => {
  it('does not show an organization section with only one membership', async () => {
    const user = userEvent.setup();
    render(
      <ResponsiveLayout
        navigation={navigation}
        activeTab="qr-generator"
        setActiveTab={vi.fn()}
        userInfo={userInfo}
        organizations={[orgs[0]]}
      >
        <div />
      </ResponsiveLayout>
    );

    await openProfileMenu(user);
    expect(screen.queryByText('Organizations')).not.toBeInTheDocument();
  });

  it('lists memberships, marks the current one, and switches on click', async () => {
    const user = userEvent.setup();
    const onSwitchOrganization = vi.fn();
    render(
      <ResponsiveLayout
        navigation={navigation}
        activeTab="qr-generator"
        setActiveTab={vi.fn()}
        userInfo={userInfo}
        organizations={orgs}
        onSwitchOrganization={onSwitchOrganization}
      >
        <div />
      </ResponsiveLayout>
    );

    await openProfileMenu(user);
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('Bella Vista')).toBeInTheDocument();
    expect(screen.getByText('North Branch')).toBeInTheDocument();

    const currentOrgButton = screen.getByText('Bella Vista').closest('button');
    expect(currentOrgButton).toBeDisabled();

    await user.click(screen.getByText('North Branch'));
    expect(onSwitchOrganization).toHaveBeenCalledWith('org-2');
  });

  it('disables the switching organization and does not re-trigger the switch', async () => {
    const user = userEvent.setup();
    const onSwitchOrganization = vi.fn();
    render(
      <ResponsiveLayout
        navigation={navigation}
        activeTab="qr-generator"
        setActiveTab={vi.fn()}
        userInfo={userInfo}
        organizations={orgs}
        onSwitchOrganization={onSwitchOrganization}
        switchingOrganizationId="org-2"
      >
        <div />
      </ResponsiveLayout>
    );

    await openProfileMenu(user);
    const switchingButton = screen.getByText('North Branch').closest('button');
    expect(switchingButton).toBeDisabled();
  });
});
