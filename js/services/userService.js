/**
 * OIMS — User & RBAC Management Service
 * Reads and mutates the real Supabase-backed employee directory
 * (public.profiles / Supabase Auth) — there is no local/offline fallback
 * here, since a user can't reach the Admin workspace at all without a
 * working Supabase session (see AuthGuard).
 */

import { supabaseService } from './supabaseService.js';

export const USER_ROLES = {
  FIELD_INSPECTOR: 'field_inspector',
  CUSTOMER_CARE_MANAGER: 'customer_care_manager',
  LEAD_ENGINEER: 'lead_engineer',
  ADMIN: 'admin'
};

export const ROLE_LABELS = {
  [USER_ROLES.FIELD_INSPECTOR]: 'Field Inspector & Technician',
  [USER_ROLES.CUSTOMER_CARE_MANAGER]: 'Customer Care & Operations Manager',
  [USER_ROLES.LEAD_ENGINEER]: 'Lead Electrical Engineer (REE)',
  [USER_ROLES.ADMIN]: 'System Administrator'
};

class UserService {
  getInitials(name) {
    if (!name) return 'US';
    const cleanName = String(name).replace(/^(Engr\.|Dr\.|Mr\.|Ms\.|PE)\s*/i, '').trim();
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const f = parts[0][0] || 'U';
      const l = parts[parts.length - 1][0] || 'S';
      return (f + l).toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return 'US';
  }

  mapProfileRow(row) {
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      department: row.department,
      status: row.status || 'ACTIVE',
      mustChangePassword: !!row.must_change_password,
      initials: this.getInitials(row.full_name),
      createdAt: row.created_at
    };
  }

  /**
   * Fetches every employee profile. Throws on failure — callers are
   * expected to catch and show a toast, same as everywhere else this app
   * talks to Supabase.
   */
  async getUsers() {
    const { data, error } = await supabaseService.withTimeout(
      supabaseService.client.from('profiles').select('*').order('created_at', { ascending: false }),
      5000,
      'Fetch user directory'
    );
    if (error) throw error;
    return (data || []).map((row) => this.mapProfileRow(row));
  }

  async updateUserRole(userId, newRole) {
    const { error } = await supabaseService.withTimeout(
      supabaseService.client.from('profiles').update({ role: newRole }).eq('id', userId),
      5000,
      'Update user role'
    );
    if (error) throw error;
    return true;
  }

  async setUserStatus(userId, newStatus) {
    const { error } = await supabaseService.withTimeout(
      supabaseService.client.from('profiles').update({ status: newStatus }).eq('id', userId),
      5000,
      'Update user status'
    );
    if (error) throw error;
    return true;
  }

  /**
   * Provisions a brand-new employee account with a temp password via the
   * admin-user-actions Edge Function (requires the service-role key, which
   * only exists server-side). public.profiles is populated automatically
   * by the on_auth_user_created DB trigger from the metadata sent here.
   * Returns { userId, tempPassword } — the caller must show tempPassword
   * to the admin exactly once; it is never retrievable again.
   */
  async createUser({ fullName, email, role, department }) {
    const { data, error } = await supabaseService.withTimeout(
      supabaseService.client.functions.invoke('admin-user-actions', {
        body: { action: 'create_user', fullName, email, role, department }
      }),
      10000,
      'Provision new user'
    );
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  /**
   * Sets a new temp password for an existing account via the same Edge
   * Function and flags must_change_password so they're forced to pick
   * their own password on next login. Returns { tempPassword }.
   */
  async resetUserPassword(userId) {
    const { data, error } = await supabaseService.withTimeout(
      supabaseService.client.functions.invoke('admin-user-actions', {
        body: { action: 'reset_password', userId }
      }),
      10000,
      'Reset user password'
    );
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }
}

export const userService = new UserService();
