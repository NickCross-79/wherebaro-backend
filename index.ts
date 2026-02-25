// Register all API functions
import "./src/functions/api/addWishlistPushToken";
import "./src/functions/api/bulkSyncWishlistPushToken";
import "./src/functions/api/deleteReview";
import "./src/functions/api/getAllItems";
import "./src/functions/api/getCurrent";
import "./src/functions/api/getLikes";
import "./src/functions/api/getReviews";
import "./src/functions/api/likeItem";
import "./src/functions/api/postReview";
import "./src/functions/api/registerPushToken";
import "./src/functions/api/removePushToken";
import "./src/functions/api/removeWishlistPushToken";
import "./src/functions/api/reportReview";
import "./src/functions/api/unlikeItem";
import "./src/functions/api/updateReview";

// Register all Manual functions
import "./src/functions/manual/baroArrivalManual";
import "./src/functions/manual/baroDepartingSoonManual";
import "./src/functions/manual/baroDepartureManual";
import "./src/functions/manual/mockBaroAbsent";
import "./src/functions/manual/mockBaroArrival";
import "./src/functions/manual/seedDBFunction";
import "./src/functions/manual/sendTestNotification";
import "./src/functions/manual/syncItemsManual";

// Register all Scheduled functions
import "./src/functions/scheduled/baroArrival";
import "./src/functions/scheduled/baroDepartingSoon";
import "./src/functions/scheduled/baroDeparture";
import "./src/functions/scheduled/syncItemsWeekly";
