const express = require('express');
const userController = require('../controllers/userController');
const advidController = require('../controllers/advidController');
const excelController = require('../controllers/excelController');



const mmptrackerController = require('../controllers/mmptrackerController');
const reviewController = require('../controllers/reviewController');
const paybleeventController = require('../controllers/paybleeventController');

const pidController = require('../controllers/pidController');
const {
  updatePublisherPlaceLink
} = require("../controllers/publdController");
const publdController = require('../controllers/publdController');

const advdataController = require('../controllers/advdataController');
const pubdataController = require('../controllers/pubdataController');
const pubidataController = require('../controllers/pubidataController');
const permissionController = require('../controllers/permissionController');

const fixEmptyAdvFields = require('../controllers/fixEmptyAdvFields');
const analyticsController = require("../controllers/analyticsController");


const  { getCampaignCount } = require("../controllers/countController");
const { getPausedPidCount } = require("../controllers/countController");
const { getLivePidCount } = require("../controllers/countController");
const { getPrmadvRequests,updateHierarchyToggle,getHierarchyToggle, getcamHierarchyToggle, updatecamHierarchyToggle } = require("../controllers/pubReqController");

const campaignPublisherMapController = require("../controllers/campaignPublisherMapController");


const {
  CampaignData,
CampaignDatanew,
  getCampaignData,
  updateCampaign,
  getCampaignList,
getPidStatus,
  copyCampaignToAdvData,
copyCampaignToAdvDatanew,
 // getLivePids,
 // getPausedPids,
 // makePidLive,
  //pausePid,
updatePidStatus,
  updateCampData,
getCampaignById

} = require("../controllers/campaignController");



const {
    createCampaignData,
    getAllCampaignData,
    updateCampaignData
  } = require('../controllers/mediaController');

const authMiddleware = require('../middlewares/authMiddleware');
// const { updateUserImage, upload } = require("../controllers/imgController");

const verifyToken = require('../middlewares/verifyToken'); // Middleware path


const router = express.Router();

// for reuests with hierarchy logic
router.get("/newPrmadvRequests", getPrmadvRequests);
router.put("/updateHierarchyToggle", updateHierarchyToggle);
router.get("/getHierarchyToggle", getHierarchyToggle);
router.get("/getcamHierarchyToggle", getcamHierarchyToggle);
router.put("/updatecamHierarchyToggle", updatecamHierarchyToggle);

//route for excel
router.get("/get-conversions/:campaignId/export", excelController.exportCampaignDetail);


//routes for analytics
router.post("/analytics/revenue", analyticsController.getRevenueAnalytics);



// routes/advRoutes.js
router.post("/fix-empty-adv-fields", fixEmptyAdvFields.fixEmptyAdvFieldsByDateRange);


// admin login, create, combin data 
router.post('/create-subadmin', userController.createSubAdmin);
router.post('/login-subadmin', userController.loginSubAdmin);
router.get('/combin-data/:pid', userController.getCombinedData);
router.get('/user-data/:userId', userController.getUserData);
router.get('/get-subadmin', userController.getSubAdmins);
router.post('/update-reviews/:id', userController.updateReview);
router.post('/change-pass/:userId', userController.changePassword);
router.put('/update-sub-admin', userController.updateSubAdmin);
router.delete('/delete-sub-admin', userController.deleteSubAdmin);
router.put('/subadmin-status/:id', userController.updateSubAdminStatus);

router.get('/assigned-users', userController.getAssignedUsers);


//login for publisher
router.post('/login-publisher', userController.publisherLogin);




//for mmp tracker
router.get('/get-mmptracker', mmptrackerController.getMMPTrackerByUserId);
router.post('/add-mmptracker', mmptrackerController.createMMPTracker);
router.post("/update-mmptracker/:id", mmptrackerController.editMMPTracker);


//for pide
router.get('/get-pid', pidController.getPids);
router.post('/add-pid', pidController.createPid);
router.post("/update-pid/:id", pidController.editPid);
router.get('/get-allpub', pidController.getAllPublishers);
router.get('/get-Namepub', pidController.getNamePublishers);
router.delete('/blacklist-delete/:id', pidController.deleteBlacklist);
router.get('/get-conversions', pidController.getClicksConversionsReport);


router.get('/conversions', pidController.getCampaignInstallsEvents);


router.get('/get-NameAdv', advidController.getAllAdvertisers
);

router.post('/add-blacklist', pidController.addBlacklist);
router.get('/get-blacklist', pidController.getAllBlacklist);


//for reviews
router.get('/get-reviews', reviewController.getReviewforall);
router.post('/add-reviews', reviewController.createReviews);
router.post("/update-reviews/:id", reviewController.editReviews);

//for payble
router.get('/get-paybleevernt', paybleeventController.getPaybleevent);
router.post('/add-paybleevernt', paybleeventController.createPayble);
router.post("/update-event/:id", paybleeventController.editPayble);



//for adv ids
router.post('/create-advid', advidController.createAdvertisement);
 router.get("/advid-data/:user_id", advidController.getAdvertisementsByUserId);
 router.put('/update-advid', advidController.updateAdvertisement);
 router.post('/advid-pause', advidController.updateAdvPause);

router.get("/advertisers/:user_id", advidController.getAllAdvertiserss);

 // Update note (PUT recommended for partial update)

 router.put('/adv_update/:id', advdataController.updateNote);
 
 

 //for publ ids
 router.post('/create-pubid', publdController.createPublisher);
 router.get("/pubid-data/:user_id", publdController.getPublisherByUserId);
 router.put('/update-pubid', publdController.updatePublisher);
 router.post('/publisher-pause', publdController.updatePublisherPause);

 

 

 //for adv data
 router.post('/add-advdata', advdataController.addAdvData);
 router.get("/get-advdata", advdataController.getAllAdvData); 
 router.get("/advdata-byuser/:id", advdataController.getAdvDataById);
 router.post("/advdata-update/:id", advdataController.updateAdvData);
 router.post("/advdata-delete-data/:id", advdataController.deleteAdvData);
 router.get('/add-datacalculation', advdataController.calculateAndUpdatePubApno);

 
//for publ data
 router.post('/add-pubdata', pubdataController.addPubData);
 router.get("/all-pubdata", pubdataController.getAllPubData); 
 router.get("/pubdata-byuser/:id", pubdataController.getPubDataByUserId);
 router.post("/pubdata-update/:id", pubdataController.updatePubData);
 router.post("/pubdata-delete-data/:id", pubdataController.deletePubData);
 router.post("/send-pub-message/", pubdataController.sendPubMessage);



 //for media controllers

router.post('/add-media', createCampaignData);
router.get('/get-allmedia', getAllCampaignData);
router.put('/update-allmedia/:id', updateCampaignData);

 

//  router.post("/addrequest", pubdataController.addPubRequest);
//  router.put("/updaterequest", pubdataController.updateAdvRes);
//  router.get("/get-allrequests", pubdataController.getAllPubRequests); 

 
 
//  router.post('/send-message', pubdataController.sendPubMessage);

 

// Routes
router.post("/campaigns", CampaignData);      // ➕ Create
router.get("/campaigns", getCampaignData);          // 📋 Get all
router.get("/campaigns/:id", getCampaignData);       // 📋 Get one by ID
router.put("/campaigns/:id", updateCampaign);
router.post("/campaignsnew", CampaignDatanew);  


router.get("/campaigns_list", getCampaignList);          // 📋 Get all
router.post("/campaigns/copy/:id", copyCampaignToAdvData);  // ✅ Copy to adv_data
router.post("/campaigns/copynew/:id", copyCampaignToAdvDatanew);  // ✅ Copy to adv_data

//route for pubiddata with adv_data
router.get("/getpubdata", pubidataController.getPubidWithAdvData);
router.put("/updatePubidData/:id", pubidataController.updatePubidData);
// Pause
router.post('/pause-campaign', pubidataController.pauseCampaign);

// Resume
router.post('/resume-campaign', pubidataController.resumeCampaign);
router.post("/mark-read", pubidataController.markAsRead);


router.get('/getpubstatusnew', pidController.getPublisherStatus);



//route for getting campaign count based on user role
router.post("/campaign-count", getCampaignCount);
router.post("/getPausedPidCount", getPausedPidCount);
router.post("/getLivePidCount", getLivePidCount);
router.post("/pid-update", getPidStatus); 

 router.put('/update-pubidmail', publdController.updatePublishermaildata);

//route for place link 

router.put("/place-link", updatePublisherPlaceLink);




//router.get("/live-pids", getLivePids);          // 📋 Get all live pids
//router.get("/paused-pids", getPausedPids);          // 📋 Get all paused pids

//router.get("/make-pidslive", makePidLive);          // 📋 Get all paused pids
//router.get("/make-pidspause", pausePid);
router.post("/pid-updatestatus", updatePidStatus);
 
router.post("/campaign-update", updateCampData); 

// GET campaign by ID
router.get("/campaign/:id", getCampaignById);



//permission routes can be added here
router.post("/permissions", permissionController.createPermission);
router.put("/permissions/:id", permissionController.updatePermission);
router.get("/permissions/user/:user_id", permissionController.getPermissionsByUser);
router.delete("/permissions/:id", permissionController.deletePermission);

//available pid id 
router.get("/available-id", pidController.getAvailableId);

//add publisher billing details
router.post("/create-publisher-billing", pidController.createPublisherBilling);
//get publisher billing details with optional filters
router.get("/get-publisher-billing", pidController.getPublisherBilling);

//new access  system
router.post("/campaign-publisher-map",              campaignPublisherMapController.createCampaignPublisherMap);
router.get("/campaign-publisher-map",               campaignPublisherMapController.getCampaignPublisherMap);
router.put("/campaign-publisher-map/:access_id",    campaignPublisherMapController.updateCampaignPublisherMap);
router.delete("/campaign-publisher-map/:access_id", campaignPublisherMapController.deleteCampaignPublisherMap);
router.get("/getassigncampaign",    campaignPublisherMapController.getAssignCampaign);


module.exports = router;
