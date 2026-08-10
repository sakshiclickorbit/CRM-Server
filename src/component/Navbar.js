import React from "react";
import { FiSearch, FiBell } from "react-icons/fi";

const Navbar = () => {
  return (
    <div className="flex justify-between items-center bg-white shadow-md p-4">
      {/* Search Bar */}
      <div className="flex items-center bg-gray-200 px-3 py-2 rounded-md w-80">
        <FiSearch className="text-gray-500" />
        <input
          type="text"
          placeholder="Search anything..."
          className="ml-2 bg-transparent outline-none w-full"
        />
      </div>

      {/* User Info */}
      <div className="flex items-center space-x-4">
        <FiBell className="text-gray-500 text-xl" />
        <div className="bg-blue-600 text-white px-4 py-2 rounded-full">Nexus Media</div>
      </div>
    </div>
  );
};

export default Navbar;
