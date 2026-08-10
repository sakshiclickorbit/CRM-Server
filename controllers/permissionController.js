const db = require('../db/Connection');

//create permission
exports.createPermission = async (req, res) => {
    try {
      const data = req.body;
  
      const sql = `
        INSERT INTO pid_permission SET ?
      `;
  
      const [result] = await db.query(sql, data);
  
      res.json({
        success: true,
        message: "Permission created",
        id: result.insertId
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  };

//update permission
  exports.updatePermission = async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
  
      const sql = `
        UPDATE pid_permission
        SET ?
        WHERE id = ?
      `;
  
      const [result] = await db.query(sql, [data, id]);
  
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Permission not found"
        });
      }
  
      res.json({
        success: true,
        message: "Permission updated"
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  };


  //get all permission
  exports.getPermissionsByUser = async (req, res) => {
    try {
      const { user_id } = req.params;
  
      const sql = `
        SELECT *
        FROM pid_permission
        WHERE user_id = ?
        ORDER BY id DESC
      `;
  
      const [rows] = await db.query(sql, [user_id]);
  
      res.json({
        success: true,
        data: rows
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  };

  //delete permission
  exports.deletePermission = async (req, res) => {
    try {
      const { id } = req.params;
  
      const sql = `
        DELETE FROM pid_permission
        WHERE id = ?
      `;
  
      const [result] = await db.query(sql, [id]);
  
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Permission not found"
        });
      }
  
      res.json({
        success: true,
        message: "Permission deleted"
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  };
  
  
  
