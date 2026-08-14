/**
 * Synx Portal — User & RBAC Management Service
 * Manages user directory, role assignments, demo user accounts, and session permissions.
 */

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

export const DEMO_ACCOUNTS = [
  {
    id: 'usr-admin-01',
    email: 'admin.clara@ecoworks.ph',
    fullName: 'Clara Santos, PE',
    role: USER_ROLES.ADMIN,
    department: 'IT & System Security',
    initials: 'CS',
    status: 'ACTIVE'
  },
  {
    id: 'usr-mgr-01',
    email: 'manager.alex@ecoworks.ph',
    fullName: 'Alex Vance',
    role: USER_ROLES.CUSTOMER_CARE_MANAGER,
    department: 'Customer Care & Operations',
    initials: 'AV',
    status: 'ACTIVE'
  },
  {
    id: 'usr-ree-01',
    email: 'ree.reyna@ecoworks.ph',
    fullName: 'Engr. Reyna Cruz, REE',
    role: USER_ROLES.LEAD_ENGINEER,
    department: 'Engineering Compliance',
    initials: 'RC',
    status: 'ACTIVE'
  },
  {
    id: 'usr-inspector-01',
    email: 'inspector.marco@ecoworks.ph',
    fullName: 'Engr. Marco Santos, REE',
    role: USER_ROLES.FIELD_INSPECTOR,
    department: 'Field Inspections',
    initials: 'MS',
    status: 'ACTIVE'
  }
];

class UserService {
  constructor() {
    this.storageKey = 'synx_users_directory';
    this.initUsers();
  }

  initUsers() {
    if (!localStorage.getItem(this.storageKey)) {
      localStorage.setItem(this.storageKey, JSON.stringify(DEMO_ACCOUNTS));
    }
  }

  getUsers() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : DEMO_ACCOUNTS;
    } catch (e) {
      return DEMO_ACCOUNTS;
    }
  }

  saveUsers(users) {
    localStorage.setItem(this.storageKey, JSON.stringify(users));
  }

  createUser(userData) {
    const users = this.getUsers();
    const newUser = {
      id: 'usr-' + Date.now(),
      email: userData.email,
      fullName: userData.fullName,
      role: userData.role || USER_ROLES.FIELD_INSPECTOR,
      department: userData.department || 'Operations',
      initials: this.getInitials(userData.fullName),
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    users.unshift(newUser);
    this.saveUsers(users);
    return newUser;
  }

  updateUserRole(userId, newRole) {
    const users = this.getUsers();
    const user = users.find(u => u.id === userId || u.email === userId);
    if (user) {
      user.role = newRole;
      this.saveUsers(users);
      return true;
    }
    return false;
  }

  toggleUserStatus(userId) {
    const users = this.getUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
      user.status = user.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
      this.saveUsers(users);
      return user;
    }
    return null;
  }

  getInitials(name) {
    if (!name) return 'US';
    const parts = name.replace(/^(Engr\.|Dr\.|Mr\.|Ms\.|PE)\s*/i, '').trim().split(' ');
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].substring(0, 2).toUpperCase();
  }
}

export const userService = new UserService();
