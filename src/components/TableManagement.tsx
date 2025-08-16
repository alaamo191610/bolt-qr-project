import React, { useState } from "react";
import { Users, Plus, Trash2, MapPin } from "lucide-react";
import { supabase } from "../lib/supabase";
import { tableService } from "../services/tableService";

interface Table {
  id: number;
  number: string;
  status: string;
  capacity: number;
}

interface TableManagementProps {
  tables: Table[];
  setTables: React.Dispatch<React.SetStateAction<Table[]>>;
  onDataChange: () => void;
}

const TableManagement: React.FC<TableManagementProps> = ({
  tables,
  setTables,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTable, setNewTable] = useState({ code: "", capacity: 4 });

  const addTable = () => {
    if (newTable.code.trim()) {
      addTableToDatabase();
    }
  };

  const addTableToDatabase = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const tableData = {
        code: newTable.code.trim(),
        admin_id: user.id,
      };

      const createdTable = await tableService.addTable(tableData);

      const uiTable: Table = {
        id: parseInt(createdTable.id) || Math.random(),
        number: createdTable.code,
        status: "available",
        capacity: newTable.capacity,
      };

      setTables((prev) => [...prev, uiTable]);
      setNewTable({ code: "", capacity: 4 });
      setShowAddModal(false);
    } catch (error) {
      console.error("Error adding table:", error);
    }
  };

  const deleteTable = (tableId: number) => {
    deleteTableFromDatabase(tableId);
  };

  const deleteTableFromDatabase = async (tableId: number) => {
    try {
      await tableService.deleteTable(tableId.toString());

      setTables((prev) => prev.filter((table) => table.id !== tableId));
    } catch (error) {
      console.error("Error deleting table:", error);
    }
  };

  const updateTableStatus = (tableId: number, newStatus: string) => {
    setTables((prev) =>
      prev.map((table) =>
        table.id === tableId ? { ...table, status: newStatus } : table
      )
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "status-available";
      case "occupied":
        return "status-occupied";
      case "reserved":
        return "status-reserved";
      case "cleaning":
        return "status-cleaning";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600";
    }
  };

  const statusOptions = ["available", "occupied", "reserved", "cleaning"];

  return (
    <div className="space-y-0 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 card-hover">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white gradient-text">
                Table Management
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                Manage restaurant tables and their status
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-4 rounded-md p-2 btn-primary "
          >
            <Plus className="w-4 h-4" />
            <span>Add Table</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-4 rounded-xl border border-green-200 dark:border-green-700">
            <div className="text-2xl font-bold text-green-800 dark:text-green-300">
              {tables.filter((table) => table.status === "available").length}
            </div>
            <div className="text-sm text-green-700 dark:text-green-400">
              Available
            </div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 p-4 rounded-xl border border-red-200 dark:border-red-700">
            <div className="text-2xl font-bold text-red-800 dark:text-red-300">
              {tables.filter((table) => table.status === "occupied").length}
            </div>
            <div className="text-sm text-red-700 dark:text-red-400">
              Occupied
            </div>
          </div>
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 p-4 rounded-xl border border-yellow-200 dark:border-yellow-700">
            <div className="text-2xl font-bold text-yellow-800 dark:text-yellow-300">
              {tables.filter((table) => table.status === "reserved").length}
            </div>
            <div className="text-sm text-yellow-700 dark:text-yellow-400">
              Reserved
            </div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-700">
            <div className="text-2xl font-bold text-blue-800 dark:text-blue-300">
              {tables.reduce((sum, table) => sum + table.capacity, 0)}
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-400">
              Total Capacity
            </div>
          </div>
        </div>
      </div>

      <div className="grid mobile-grid tablet-grid lg:grid-cols-3 gap-6">
        {tables.map((table) => (
          <div
            key={table.id}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 card-hover"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Table {table.number}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Seats {table.capacity}
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => deleteTable(table.id)}
                  className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors duration-200"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Status
              </label>
              <select
                value={table.status}
                onChange={(e) => updateTableStatus(table.id, e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-sm font-medium ${getStatusColor(
                  table.status
                )}`}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
                  `${window.location.origin}/menu?table=${table.number}`
                )}`}
                alt={`QR Code for Table ${table.number}`}
                className="mx-auto mb-2 rounded-xl border border-slate-200 dark:border-slate-600 shadow-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                QR Code for Menu Access
              </p>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              Add New Table
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Table Code
                </label>
                <input
                  type="text"
                  value={newTable.code}
                  onChange={(e) =>
                    setNewTable((prev) => ({ ...prev, code: e.target.value }))
                  }
                  placeholder="e.g., T05, A1, VIP1"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Seating Capacity
                </label>
                <input
                  type="number"
                  value={newTable.capacity}
                  onChange={(e) =>
                    setNewTable((prev) => ({
                      ...prev,
                      capacity: parseInt(e.target.value) || 1,
                    }))
                  }
                  min="1"
                  max="20"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="items-center gap-4 rounded-md p-2 flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={addTable}
                className="items-center gap-4 rounded-md p-2 flex-1 btn-primary"
              >
                Add Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableManagement;
