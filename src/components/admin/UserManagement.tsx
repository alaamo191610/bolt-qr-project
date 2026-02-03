import React, { useState, useEffect } from "react";
import { UserCog, Plus, Trash2, Mail, Store } from "lucide-react";
import { adminService } from "../../services/adminService";
import { toast } from "react-hot-toast";
import type { Admin } from "../../lib/supabase";

const UserManagement: React.FC = () => {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    restaurant_name: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    try {
      const data = await adminService.getAllAdmins();
      setAdmins(data);
    } catch (error) {
      toast.error("Failed to load users");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password) return;

    try {
      setSubmitting(true);
      await adminService.createAdmin(newUser);
      toast.success("User added successfully");
      setNewUser({ email: "", password: "", restaurant_name: "" });
      setShowAddModal(false);
      loadAdmins();
    } catch (error: any) {
      toast.error(error.message || "Failed to add user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      await adminService.deleteAdmin(id);
      toast.success("User deleted");
      setAdmins((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      toast.error("Failed to delete user");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
              <UserCog className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                User Management
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                Manage application administrators and restaurant owners
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Users List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {admins.map((admin) => (
          <div
            key={admin.id}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    {admin.restaurant_name || "Unnamed Restaurant"}
                  </h3>
                  <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <Mail className="w-3 h-3 mr-1" />
                    {admin.email}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDeleteUser(admin.id)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Delete User"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3 mt-2">
              ID: <span className="font-mono">{admin.id}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Add New User
            </h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Restaurant Name
                </label>
                <input
                  type="text"
                  value={newUser.restaurant_name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, restaurant_name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Adding..." : "Add User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
