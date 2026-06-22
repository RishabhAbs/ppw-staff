import { useState, useEffect, useCallback } from "react";
import {
  getUsers,
  createUser,
  deleteUser,
  updateUser,
  getStockParents,
  getStockCategories,
} from "../api";
import {
  Plus,
  Trash2,
  X,
  Edit2,
  Search,
  Check,
  ShieldCheck,
  Tag,
  Box,
  UserCheck,
  UserX,
} from "lucide-react";

export default function AdminProfile() {
  const [users, setUsers] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [newUser, setNewUser] = useState<{
    username: string;
    password?: string;
    name: string;
    number: string;
    role: string;
    system_perms: string[];
    allowedOrderTypes: string[];
    allowedGodowns: string[];
  }>({
    username: "",
    password: "",
    name: "",
    number: "",
    role: "employee",
    system_perms: [],
    allowedOrderTypes: ["Tax Invoice", "Quotation"],
    allowedGodowns: ["Shop", "Pb"],
  });

  // PermPicker State
  const [allowed_parents, setAllowedParents] = useState<string[]>([]);
  const [allowed_categories, setAllowedCategories] = useState<string[]>([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      console.error(error);
    }
  };

  const resetForm = () => {
    setNewUser({
      username: "",
      password: "",
      name: "",
      number: "",
      role: "employee",
      system_perms: [],
      allowedOrderTypes: ["Tax Invoice", "Quotation"],
      allowedGodowns: ["Shop", "Pb"],
    });
    setAllowedParents([]);
    setAllowedCategories([]);
    setEditingUserId(null);
    setShowAddModal(false);
  };

  const handleSaveUser = async () => {
    try {
      const { system_perms, allowedOrderTypes, allowedGodowns, ...rest } =
        newUser;
      const payload: any = { ...rest };

      // Attach permissions if not admin
      if (newUser.role !== "admin") {
        payload.permissions = {
          allowedParents: allowed_parents,
          allowedCategories: allowed_categories,
          system: system_perms,
          orderTypes: allowedOrderTypes,
          godowns: allowedGodowns,
        };
      }

      if (editingUserId) {
        if (!payload.password) delete payload.password;
        await updateUser(editingUserId, payload);
        alert("User updated!");
      } else {
        await createUser(payload);
        alert("User created!");
      }
      resetForm();
      fetchUsers();
    } catch (error: any) {
      const msg = error?.response?.data?.message || "Operation failed";
      alert(msg);
      console.error(error);
    }
  };

  const handleEditClick = (user: any) => {
    setEditingUserId(user.id);
    const perms = user.permissions || {};
    setNewUser({
      username: user.username,
      password: "",
      name: user.name || "",
      number: user.number || "",
      role: user.role,
      system_perms: perms.system || [],
      allowedOrderTypes: perms.orderTypes || ["Tax Invoice", "Quotation"],
      allowedGodowns: perms.godowns || ["Shop", "Pb"],
    });

    // Load permissions
    setAllowedParents(perms.allowedParents || []);
    setAllowedCategories(perms.allowedCategories || []);

    setShowAddModal(true);
  };

  const handleDeleteUser = async (id: number) => {
    if (!confirm("Are you sure?")) return;
    try {
      await deleteUser(id);
      fetchUsers();
    } catch (error) {
      console.error(error);
    }
  };

  const handleToggleActive = async (user: any) => {
    const nextActive = user.is_active === false; // currently inactive -> activate
    const action = nextActive ? "activate" : "deactivate";
    if (!confirm(`Are you sure you want to ${action} ${user.name || user.username}?`))
      return;
    try {
      await updateUser(user.id, { is_active: nextActive });
      fetchUsers();
    } catch (error: any) {
      const msg = error?.response?.data?.message || "Operation failed";
      alert(msg);
      console.error(error);
    }
  };

  return (
    <div className="p-6 space-y-6 pb-24">
      <div className="flex items-center gap-3 mb-2">
        <img
          src="/ppw-logo.png"
          alt="Logo"
          className="w-10 h-10 object-contain"
        />
        <h2 className="text-3xl font-bold text-slate-800">Roles Management</h2>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-slate-500">Manage access and roles.</p>
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-indigo-200 active:scale-95 transition-transform"
          >
            <Plus size={18} />
            Add Staff
          </button>
        </div>

        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className={`bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between transition-opacity ${
                user.is_active === false ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-lg uppercase">
                  {user.username.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-slate-800 flex items-center gap-2">
                    {user.name || user.username}
                    {user.is_active === false && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                        Inactive
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 capitalize flex items-center gap-1">
                    {user.role} <span className="text-slate-300">•</span>{" "}
                    {user.number || "No Phone"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEditClick(user)}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Edit User"
                >
                  <Edit2 size={18} />
                </button>
                {user.username !== "admin" && (
                  <>
                    <button
                      onClick={() => handleToggleActive(user)}
                      className={`p-2 rounded-lg transition-colors ${
                        user.is_active === false
                          ? "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                          : "text-emerald-600 hover:bg-emerald-50"
                      }`}
                      title={
                        user.is_active === false
                          ? "Activate User"
                          : "Deactivate User"
                      }
                    >
                      {user.is_active === false ? (
                        <UserX size={18} />
                      ) : (
                        <UserCheck size={18} />
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove User"
                    >
                      <Trash2 size={18} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]">
            <button
              onClick={resetForm}
              className="absolute top-4 right-4 z-10 text-slate-400 hover:text-slate-600 bg-white/80 backdrop-blur-sm p-1 rounded-full"
            >
              <X size={20} />
            </button>

            <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
              <div className="mb-2">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">
                  {editingUserId ? "Edit Staff" : "Add New Staff"}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {editingUserId
                    ? "Update employee details"
                    : "Create new employee login"}
                </p>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                      Username
                    </label>
                    <input
                      value={newUser.username}
                      onChange={(e) =>
                        setNewUser({ ...newUser, username: e.target.value })
                      }
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 text-xs font-bold"
                      disabled={!!editingUserId}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                      Password
                    </label>
                    <input
                      value={newUser.password || ""}
                      onChange={(e) =>
                        setNewUser({ ...newUser, password: e.target.value })
                      }
                      placeholder={editingUserId ? "Leave empty" : ""}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 text-xs font-bold"
                    />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                    Full Name
                  </label>
                  <input
                    value={newUser.name}
                    onChange={(e) =>
                      setNewUser({ ...newUser, name: e.target.value })
                    }
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 text-xs font-bold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                      Phone Number
                    </label>
                    <input
                      value={newUser.number}
                      onChange={(e) =>
                        setNewUser({ ...newUser, number: e.target.value })
                      }
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">
                      Role
                    </label>
                    <select
                      value={newUser.role}
                      onChange={(e) => {
                        const role = e.target.value;
                        setNewUser({
                          ...newUser,
                          role,
                          system_perms: role === "manager" ? ["inventory"] : [],
                        });
                      }}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 appearance-none text-xs font-bold"
                    >
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Permissions Section - Only for non-admins */}
              {newUser.role !== "admin" && (
                <div className="space-y-4 pt-3 border-t border-slate-100">
                  {/* 1. System Pages Access */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-indigo-600" />
                      <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                        System Page Access
                      </h4>
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 leading-tight uppercase">
                      Grant access to specific modules.
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: "dashboard", label: "Dashboard" },
                        { id: "inventory", label: "Inventory" },
                        { id: "orders", label: "Orders" },
                        { id: "staff", label: "Staff" },
                        { id: "ledgers", label: "Ledgers" },
                        { id: "sync", label: "Sync" },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            const current = newUser.system_perms;
                            const next = current.includes(p.id)
                              ? current.filter((x: string) => x !== p.id)
                              : [...current, p.id];
                            setNewUser({ ...newUser, system_perms: next });
                          }}
                          className={`px-2 py-1.5 rounded-xl text-[10px] font-black border transition-all text-center flex flex-col items-center justify-center gap-0.5 ${
                            newUser.system_perms.includes(p.id)
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                              : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                          }`}
                        >
                          <span className="leading-tight">{p.label}</span>
                          {newUser.system_perms.includes(p.id) && (
                            <Check size={8} strokeWidth={5} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Data Restrictions */}
                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <Tag size={16} className="text-violet-600" />
                      <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                        Data Restrictions
                      </h4>

                      {/* Order Type Tabs */}
                      <div className="ml-auto flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        {["Tax Invoice", "Quotation"].map((type) => {
                          const isSelected = newUser.allowedOrderTypes.includes(type);
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                const current = newUser.allowedOrderTypes;
                                const next = isSelected
                                  ? current.filter((t) => t !== type)
                                  : [...current, type];
                                setNewUser({
                                  ...newUser,
                                  allowedOrderTypes: next,
                                });
                              }}
                              className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                                isSelected
                                  ? "bg-white text-indigo-600 shadow-sm"
                                  : "text-slate-400 hover:text-slate-600"
                              }`}
                            >
                              {type === "Tax Invoice" ? "Inv" : "Quo"}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 leading-tight uppercase">
                      Restrict brands/categories & order types.
                    </p>

                    <div className="space-y-3">
                      <PermPicker
                        label="Allowed Brands"
                        icon={<Box size={14} />}
                        selectedItems={allowed_parents}
                        fetchItems={getStockParents}
                        onToggle={(item) =>
                          togglePermItem(
                            item,
                            allowed_parents,
                            setAllowedParents,
                          )
                        }
                      />
                      <PermPicker
                        label="Allowed Categories"
                        icon={<Tag size={14} />}
                        selectedItems={allowed_categories}
                        fetchItems={getStockCategories}
                        onToggle={(item) =>
                          togglePermItem(
                            item,
                            allowed_categories,
                            setAllowedCategories,
                          )
                        }
                      />
                    </div>
                  </div>

                  {/* 3. Godown Restriction */}
                  <div className="space-y-3 pt-4 mt-1 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <Box size={16} className="text-amber-600" />
                      <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                        Godown Restriction
                      </h4>

                      {/* Godown Tabs */}
                      <div className="ml-auto flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        {[
                          { id: "Shop", label: "Shop" },
                          { id: "Pb", label: "PB" },
                        ].map((g) => {
                          const isSelected = newUser.allowedGodowns.includes(
                            g.id,
                          );
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => {
                                const current = newUser.allowedGodowns;
                                const next = isSelected
                                  ? current.filter((x) => x !== g.id)
                                  : [...current, g.id];
                                setNewUser({
                                  ...newUser,
                                  allowedGodowns: next,
                                });
                              }}
                              className={`px-2 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                                isSelected
                                  ? "bg-white text-amber-600 shadow-sm"
                                  : "text-slate-400 hover:text-slate-600"
                              }`}
                            >
                              {g.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 leading-tight uppercase">
                      Restrict which godowns this staff can sell from.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100">
              <button
                onClick={handleSaveUser}
                className="w-full py-3 bg-indigo-600 text-white text-sm font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-100 active:scale-[0.98] transition-all"
              >
                {editingUserId ? "Update Account" : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to toggle items in a permission array
function togglePermItem(
  item: string,
  list: string[],
  setList: (l: string[]) => void,
) {
  if (list.includes(item)) {
    setList(list.filter((x) => x !== item));
  } else {
    setList([...list, item]);
  }
}

// Reusable Permission Picker Component
function PermPicker({
  label,
  icon,
  selectedItems,
  fetchItems,
  onToggle,
}: {
  label: string;
  icon: any;
  selectedItems: string[];
  fetchItems: (search: string) => Promise<string[]>;
  onToggle: (item: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const searchRef = useCallback(
    async (query: string) => {
      if (!query) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchItems(query);
        setResults(data.filter((x) => x && x.trim() !== ""));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [fetchItems],
  );

  useEffect(() => {
    const timer = setTimeout(() => searchRef(search), 300);
    return () => clearTimeout(timer);
  }, [search, searchRef]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
        {icon}
        {label}
        <span className="ml-auto text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">
          {selectedItems.length} Selected
        </span>
      </div>

      {/* Selected Pills */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedItems.map((item) => (
            <button
              key={item}
              onClick={() => onToggle(item)}
              className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg text-[10px] font-bold border border-indigo-200 hover:bg-indigo-200"
            >
              {item}
              <X size={12} />
            </button>
          ))}
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          placeholder={`Search ${label}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-400"
        />
      </div>

      {/* Search Results */}
      {search.length > 0 && (
        <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-xl bg-white shadow-lg divide-y divide-slate-50">
          {loading ? (
            <div className="p-2 text-center text-[10px] font-bold text-indigo-500 animate-pulse">
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="p-2 text-center text-[10px] font-bold text-slate-400">
              No matches found
            </div>
          ) : (
            results.map((item) => {
              const isSelected = selectedItems.includes(item);
              return (
                <button
                  key={item}
                  onClick={() => onToggle(item)}
                  className="w-full text-left px-3 py-2 text-[10px] font-bold hover:bg-slate-50 flex justify-between items-center"
                >
                  <span
                    className={
                      isSelected ? "text-indigo-600" : "text-slate-700"
                    }
                  >
                    {item}
                  </span>
                  {isSelected && (
                    <Check size={14} className="text-indigo-600" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
