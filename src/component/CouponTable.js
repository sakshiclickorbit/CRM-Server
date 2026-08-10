import React from "react";

const coupons = [
  { code: "TERE12876NAAM", spec: "20% off on all orders", expiry: "12/04/2025", limit: "Unlimited", redeemed: "50/∞" },
  { code: "Mere12876NAAM", spec: "Free Delivery", expiry: "12/04/2025", limit: "Unlimited", redeemed: "500/∞" },
  { code: "USKE12876NAAM", spec: "20% off on Laptop", expiry: "12/04/2025", limit: "100", redeemed: "50/100" },
  { code: "SABKE12876NAAM", spec: "20% off on Black T-shirt", expiry: "Never Expire", limit: "85", redeemed: "20/85" },
];

const CouponTable = () => {
  return (
    <div className="bg-white p-6 shadow-md rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Coupon</h2>
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="Search coupon"
            className="border p-2 rounded-md"
          />
          <button className="bg-blue-600 text-white px-4 py-2 rounded-md">Filter</button>
        </div>
      </div>

      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Coupon Code</th>
            <th className="border p-2">Specification</th>
            <th className="border p-2">Expiry Date</th>
            <th className="border p-2">Coupon Limit</th>
            <th className="border p-2">Redeemed</th>
          </tr>
        </thead>
        <tbody>
          {coupons.map((coupon, index) => (
            <tr key={index} className="text-center">
              <td className="border p-2">{coupon.code}</td>
              <td className="border p-2">{coupon.spec}</td>
              <td className="border p-2">{coupon.expiry}</td>
              <td className="border p-2">{coupon.limit}</td>
              <td className="border p-2">{coupon.redeemed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CouponTable;
