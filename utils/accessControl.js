const getAccessibleUserIds = async (conn, userId) => {
    try {
    // =========================================================
      // 1️⃣ Get current user
   // =========================================================

      const [[user]] = await conn.query(
        `SELECT id, role FROM login WHERE id = ? AND pause = 0`,
        [userId]
      );
  
      if (!user) return [];
  
      const { role } = user;
  
      // =========================================================
      //  HELPER: GET FULL HIERARCHY (RECURSIVE)
      // =========================================================
      const getAllSubAdmins = async (startIds) => {
        let allIds = [...startIds];
        let queue = [...startIds];
  
        while (queue.length > 0) {
          const placeholders = queue.map(() => '?').join(',');
  
          const [rows] = await conn.query(
            `SELECT sub_admin_id 
             FROM manager_subadmins 
             WHERE manager_id IN (${placeholders})`,
            queue
          );
  
          const newIds = rows
            .map(r => r.sub_admin_id)
            .filter(id => !allIds.includes(id));
  
          if (newIds.length === 0) break;
  
          allIds.push(...newIds);
          queue = newIds;
        }
  
        return allIds;
      };
  
      // =========================================================
      // ADMIN → FULL ACCESS OF ALL APIS
      // =========================================================
      if (role === 'admin') {
        const [allUsers] = await conn.query(
          `SELECT id FROM login WHERE pause = 0`
        );
        return allUsers.map(u => u.id);
      }
  
      // =========================================================
      //  MANAGER ROLES → FULL TREE ACCESS
      // publisher_manager / advertiser_manager
      // =========================================================
      if (['publisher_manager', 'advertiser_manager'].includes(role)) {
        const allIds = await getAllSubAdmins([userId]);
        return [...new Set(allIds)];
      }
  
      // =========================================================
      //  PUBLISHER / ADVERTISER
      // → self + their executives
      // =========================================================
      if (['publisher', 'advertiser'].includes(role)) {
        const allIds = await getAllSubAdmins([userId]);
        return [...new Set(allIds)];
      }
  
      // =========================================================
      //  EXECUTIVES → ONLY SELF
      // =========================================================
      if (['pub_executive', 'adv_executive'].includes(role)) {
        return [userId];
      }
  
      // =========================================================
      //  OPERATIONS / OPTIMIZATION
      // → self (extend later with assignment table)
      // =========================================================
      if (['operations', 'optimization'].includes(role)) {
        return [userId];
      }
  
      // =========================================================
      //  DEFAULT → SAFE FALLBACK FOR ALL
      // =========================================================
      return [userId];
  
    } catch (err) {
      console.error('Access Control Error:', err);
      return [];
    }
  };
  
  module.exports = { getAccessibleUserIds };
