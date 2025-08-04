import React, { useState } from 'react';
import { Edit, Plus, Settings, Trash2, X} from 'lucide-react';
import { menuService } from '../services/menuService';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../contexts/LanguageContext';

interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  image: string;
}

interface AdminPanelProps {
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ 
  menuItems, 
  setMenuItems
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('menu');
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useLanguage();
  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    price: 0,
    category: 'Main Course',
    image: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=300'
  });

  const categories = ['Pizza', 'Salads', 'Main Course', 'Beverages', 'Desserts', 'Appetizers'];

  const addMenuItem = async () => {
    if (!newItem.name.trim() || !user) return;
    
    try {
      setIsLoading(true);
      
      const menuItemData = {
        name_en: newItem.name.trim(),
        name_ar: newItem.description,
        price: newItem.price,
        available: true,
        image_url: newItem.image,
        user_id: user.id
      };
      
      const createdItem = await menuService.addMenuItem(menuItemData);
      
      const newMenuItem: MenuItem = {
        id: parseInt(createdItem.id) || Math.random(),
        name: createdItem.name_en,
        description: createdItem.name_ar || createdItem.name_en,
        price: createdItem.price,
        category: newItem.category,
        image: createdItem.image_url || newItem.image
      };
      
      setMenuItems(prev => [...prev, newMenuItem]);
      setNewItem({
        name: '',
        description: '',
        price: 0,
        category: 'Main Course',
        image: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=300'
      });
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding menu item:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateMenuItem = async (updatedItem: MenuItem) => {
    try {
      setIsLoading(true);
      
      const updateData = {
        name_en: updatedItem.name,
        name_ar: updatedItem.description,
        price: updatedItem.price,
        image_url: updatedItem.image
      };
      
      await menuService.updateMenuItem(updatedItem.id.toString(), updateData);
      
      setMenuItems(prev => prev.map(item => 
        item.id === updatedItem.id ? updatedItem : item
      ));
      setEditingItem(null);
    } catch (error) {
      console.error('Error updating menu item:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteMenuItem = async (itemId: number) => {
    try {
      setIsLoading(true);
      await menuService.deleteMenuItem(itemId.toString());
      setMenuItems(prev => prev.filter(item => item.id !== itemId));
    } catch (error) {
      console.error('Error deleting menu item:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const stockImages = [
    'https://images.pexels.com/photos/2762942/pexels-photo-2762942.jpeg?auto=compress&cs=tinysrgb&w=300',
    'https://images.pexels.com/photos/2696064/pexels-photo-2696064.jpeg?auto=compress&cs=tinysrgb&w=300',
    'https://images.pexels.com/photos/3004973/pexels-photo-3004973.jpeg?auto=compress&cs=tinysrgb&w=300',
    'https://images.pexels.com/photos/774506/pexels-photo-774506.jpeg?auto=compress&cs=tinysrgb&w=300',
    'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=300',
    'https://images.pexels.com/photos/1099680/pexels-photo-1099680.jpeg?auto=compress&cs=tinysrgb&w=300'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t('admin.title')}</h2>
            <p className="text-slate-600">{t('admin.subtitle')}</p>
          </div>
        </div>
  
        {/* Tab Navigation */}
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('menu')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
              activeTab === 'menu'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t('admin.tabs.menu')}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
              activeTab === 'settings'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t('admin.tabs.settings')}
          </button>
        </div>
      </div>
  
      {activeTab === 'menu' && (
        <div className="space-y-6">
          {/* Add Item Button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span>Add Menu Item</span>
            </button>
          </div>

          {/* Menu Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map(item => (
              <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-40 object-cover"
                />
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-900">{item.name}</h3>
                    <span className="text-lg font-bold text-emerald-600">${item.price}</span>
                  </div>
                  <p className="text-sm text-slate-600 mb-2">{item.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">
                      {item.category}
                    </span>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setEditingItem(item)}
                        className="p-1 text-slate-600 hover:text-emerald-600 transition-colors duration-200"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMenuItem(item.id)}
                        className="p-1 text-slate-600 hover:text-red-600 transition-colors duration-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Restaurant Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Restaurant Name</label>
              <input
                type="text"
                defaultValue="Bella Vista Restaurant"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Contact Phone</label>
              <input
                type="tel"
                defaultValue="+1 (555) 123-4567"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Address</label>
              <input
                type="text"
                defaultValue="123 Main Street, City, State 12345"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
              <textarea
                rows={3}
                defaultValue="Fine dining experience with fresh, locally sourced ingredients and exceptional service."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex justify-end mt-6">
            <button className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors duration-200">
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Add Menu Item</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Name</label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newItem.price}
                    onChange={(e) => setNewItem(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                  <textarea
                    rows={3}
                    value={newItem.description}
                    onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Image</label>
                <div className="space-y-4">
                  <img
                    src={newItem.image}
                    alt="Preview"
                    className="w-full h-40 object-cover rounded-lg border border-slate-200"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {stockImages.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => setNewItem(prev => ({ ...prev, image }))}
                        className={`border-2 rounded-lg overflow-hidden ${
                          newItem.image === image ? 'border-emerald-500' : 'border-slate-200'
                        }`}
                      >
                        <img src={image} alt="" className="w-full h-16 object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={addMenuItem}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors duration-200"
              >
                {isLoading ? 'Adding...' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Edit Menu Item</h3>
              <button
                onClick={() => setEditingItem(null)}
                className="p-2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Name</label>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, name: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingItem.price}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, price: parseFloat(e.target.value) || 0 } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Category</label>
                  <select
                    value={editingItem.category}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, category: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                  <textarea
                    rows={3}
                    value={editingItem.description}
                    onChange={(e) => setEditingItem(prev => prev ? { ...prev, description: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Image</label>
                <div className="space-y-4">
                  <img
                    src={editingItem.image}
                    alt="Preview"
                    className="w-full h-40 object-cover rounded-lg border border-slate-200"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {stockImages.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => setEditingItem(prev => prev ? { ...prev, image } : null)}
                        className={`border-2 rounded-lg overflow-hidden ${
                          editingItem.image === image ? 'border-emerald-500' : 'border-slate-200'
                        }`}
                      >
                        <img src={image} alt="" className="w-full h-16 object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={() => editingItem && updateMenuItem(editingItem)}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors duration-200"
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  
};

export default AdminPanel;