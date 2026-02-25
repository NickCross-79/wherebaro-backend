// Register all API functions
import "./api/addWishlistPushToken";
import "./api/bulkSyncWishlistPushToken";
import "./api/deleteReview";
import "./api/getAllItems";
import "./api/getCurrent";
import "./api/getLikes";
import "./api/getReviews";
import "./api/likeItem";
import "./api/postReview";
import "./api/registerPushToken";
import "./api/removePushToken";
import "./api/removeWishlistPushToken";
import "./api/reportReview";
import "./api/unlikeItem";
import "./api/updateReview";

// Register all Manual functions
import "./manual/baroArrivalManual";
import "./manual/baroDepartingSoonManual";
import "./manual/baroDepartureManual";
import "./manual/mockBaroAbsent";
import "./manual/mockBaroArrival";
import "./manual/seedDBFunction";
import "./manual/sendTestNotification";
import "./manual/syncItemsManual";

// Register all Scheduled functions
import "./scheduled/baroArrival";
import "./scheduled/baroDepartingSoon";
import "./scheduled/baroDeparture";
import "./scheduled/syncItemsWeekly";
