import React from "react";
import { FiHome, FiShoppingCart, FiSettings, FiUsers } from "react-icons/fi";

const Sidebar = () => {
  return (
    <div className="h-screen w-64 bg-blue-900 text-white flex flex-col p-4">
      {/* Logo */}
      <div className="text-2xl font-bold mb-6">SIGNFEED</div>

      {/* Navigation */}
      <nav className="flex flex-col space-y-4">
        <a href="#" className="flex items-center space-x-2 p-2 hover:bg-blue-700 rounded">
          <FiHome /> <span>Home</span>
        </a>
        <a href="#" className="flex items-center space-x-2 p-2 hover:bg-blue-700 rounded">
          <FiShoppingCart /> <span>Orders</span>
        </a>
        <a href="#" className="flex items-center space-x-2 p-2 hover:bg-blue-700 rounded">
          <FiUsers /> <span>Customers</span>
        </a>
        <a href="#" className="flex items-center space-x-2 p-2 hover:bg-blue-700 rounded">
          <FiSettings /> <span>Settings</span>
        </a>
      </nav>

      {/* Logout */}
      <div className="mt-auto">
        <button className="flex items-center space-x-2 p-2 hover:bg-red-700 w-full text-left rounded">
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
