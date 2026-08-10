import React from "react";
import Sidebar from "./component/Sidebar";
import Navbar from "./component/Navbar";
import CouponTable from "./component/CouponTable";

const Dashboard = () => {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <Navbar />

        <div className="p-6">
          <CouponTable />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
