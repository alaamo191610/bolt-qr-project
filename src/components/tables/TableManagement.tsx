import React, { useState } from "react";
import { Users, Plus, Trash2 } from "lucide-react";
import { tableService } from "../../services/tableService";
import toast from "react-hot-toast";
import { socket } from "../../services/socket";
import { useAuth } from "../../providers/AuthProvider";

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { user } = useAuth();

  React.useEffect(() => {
    if (!user?.id) return;

    const handleTableUpdate = (updatedTable: any) => {
      setTables((prev) =>
        prev.map((table) =>
          table.id === updatedTable.id
            ? { ...table, status: updatedTable.status }
            : table
        )
      );
    };

    socket.on("table-updated", handleTableUpdate);

    return () => {
      socket.off("table-updated", handleTableUpdate);
    };
  }, [user?.id, setTables]);

  const addTable = () => {
    if (newTable.code.trim()) {
      addTableToDatabase();
    }
  };

  const addTableToDatabase = async () => {
    try {
      const tableData = {
        code: newTable.code.trim(),
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
      toast.success("Table added successfully!");
    } catch (error: any) {
      console.error("Error adding table:", error);
      toast.error(error.message || "Failed to add table");
    }
  };

  const deleteTable = (tableId: number) => {
    const table = tables.find(t => t.id === tableId);
    if (table?.status === 'occupied') {
      toast.error("Cannot delete an occupied table");
      return;
    }
    setTableToDelete(tableId);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!tableToDelete) return;

    setIsDeleting(true);
    try {
      await tableService.deleteTable(tableToDelete.toString());
      setTables((prev) => prev.filter((table) => table.id !== tableToDelete));
      toast.success("Table deleted successfully");
      setShowDeleteModal(false);
    } catch (error: any) {
      console.error("Error deleting table:", error);
      toast.error(error.message || "Failed to delete table");
    } finally {
      setIsDeleting(false);
      setTableToDelete(null);
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
        return "bg-emerald-100/50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/50";
      case "occupied":
        return "bg-rose-100/50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/50";
      case "reserved":
        return "bg-amber-100/50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50";
      case "cleaning":
        return "bg-violet-100/50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700/50";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600";
    }
  };

  return (
    <div className="space-y-8 animate-fade-in p-2">
      {/* Sticky Header */}
      <div className="bg-white/90 dark:bg-slate-800/90 rounded-3xl shadow-lg border border-slate-200/50 dark:border-slate-700/50 p-6 sticky top-4 z-20 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 transform hover:scale-105 transition-transform duration-300">
              <Users className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                Table Management
              </h2>
              <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
                Overview of {tables.length} tables
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="group flex items-center gap-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 active:scale-95"
          >
            <div className="w-6 h-6 rounded-lg bg-white/20 dark:bg-black/10 flex items-center justify-center group-hover:bg-white/30 dark:group-hover:bg-black/20 transition-colors">
              <Plus className="w-4 h-4" />
            </div>
            <span>New Table</span>
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {[
            { label: 'Available', count: tables.filter(t => t.status === "available").length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Occupied', count: tables.filter(t => t.status === "occupied").length, color: 'text-rose-600', bg: 'bg-rose-50' },
            { label: 'Reserved', count: tables.filter(t => t.status === "reserved").length, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Capacity', count: tables.reduce((acc, t) => acc + t.capacity, 0), color: 'text-blue-600', bg: 'bg-blue-50' }
          ].map((stat, idx) => (
            <div key={idx} className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 group hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${stat.color} dark:text-white`}>{stat.count}</span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">{stat.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {tables.map((table) => (
          <div
            key={table.id}
            className="group relative bg-white dark:bg-slate-800 rounded-[2rem] shadow-sm border border-slate-200 dark:border-slate-700 p-1 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
          >
            <div className="p-6 h-full flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div className="relative">
                  <div className="absolute -left-2 -top-2 w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Table</p>
                    <h3 className="text-3xl font-medium text-slate-900 dark:text-white">
                      {table.number}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
                      <Users className="w-3.5 h-3.5" />
                      <span>{table.capacity} Seats</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => deleteTable(table.id)}
                  disabled={table.status === 'occupied'}
                  className={`p-3 rounded-xl transition-all duration-200 ${table.status === 'occupied'
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed bg-slate-50 dark:bg-slate-800'
                    : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 bg-transparent'
                    }`}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-auto space-y-4">
                <div className="relative">
                  <select
                    value={table.status}
                    onChange={(e) => updateTableStatus(table.id, e.target.value)}
                    className={`w-full appearance-none pl-4 pr-10 py-3 rounded-xl border font-bold text-sm transition-all focus:ring-2 focus:ring-offset-2 ${getStatusColor(table.status)}`}
                  >
                    {["available", "occupied", "reserved", "cleaning"].map((s) => (
                      <option key={s} value={s} className="bg-white text-slate-900">
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between group/qr">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover/qr:text-emerald-500 transition-colors">Digital Menu</span>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
                      `${window.location.origin}/menu?table=${table.number}`
                    )}&color=64748b`}
                    alt={`QR ${table.number}`}
                    className="w-10 h-10 rounded-lg opacity-50 grayscale group-hover/qr:grayscale-0 group-hover/qr:opacity-100 transition-all duration-300"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Add New Card (Empty State) */}
        <button
          onClick={() => setShowAddModal(true)}
          className="group min-h-[280px] rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 flex flex-col items-center justify-center gap-4 transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30">
            <Plus className="w-8 h-8 text-slate-400 group-hover:text-emerald-600 transition-colors" />
          </div>
          <span className="font-bold text-slate-500 group-hover:text-emerald-600 transition-colors">Add New Table</span>
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-8 animate-scale-in border border-slate-100 dark:border-slate-700">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              New Table
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8">Add a table for customers to order from.</p>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Table Number / Code
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-slate-400 font-bold">#</span>
                  </div>
                  <input
                    type="text"
                    value={newTable.code}
                    onChange={(e) =>
                      setNewTable((prev) => ({ ...prev, code: e.target.value }))
                    }
                    placeholder="e.g. 12"
                    className="w-full pl-8 pr-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Capacity
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={newTable.capacity}
                    onChange={(e) => setNewTable(prev => ({ ...prev, capacity: parseInt(e.target.value) }))}
                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                  <span className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700 font-bold text-slate-900 dark:text-white">
                    {newTable.capacity}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-10">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addTable}
                className="flex-1 py-3.5 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-emerald-50 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                Create Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal - refined */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-scale-in text-center">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8 text-rose-600 dark:text-rose-400" />
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Delete Table?
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              This will remove the table and its QR code. This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-500/30 transition-all"
              >
                {isDeleting ? "Deleting..." : "Delete It"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableManagement;
