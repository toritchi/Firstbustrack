import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { login } from './modules/auth/auth.js';
import { listAdmins,createAdmin,updateAdmin,getAuditLog } from './modules/admin/admin.js';
import { notFound,errorHandler } from './middleware/error.js';
import { requestId,corsFromConfig,apiRateLimit,authRateLimit } from './middleware/security.js';
import { query } from './database/db.js';
import { pingLiveStore } from './services/liveStore.js';
import { authenticate,authorize } from './middleware/auth.js';
import * as transport from './modules/transport/transport.js';
import * as fleet from './modules/fleet/fleet.js';
import * as trips from './modules/trips.js';
import * as eta from './modules/eta/eta.js';
import * as passenger from './modules/passenger/passenger.js';
import * as account from './modules/passenger/account.js';
import * as occupancy from './modules/occupancy.js';
import * as ticketing from './modules/ticketing/ticketing.js';
import { authenticatePassenger } from './middleware/passengerAuth.js';
import * as payments from './modules/payments/payments.js';
import * as notifications from './modules/notifications/notifications.js';
import * as reporting from './modules/reporting/reporting.js';
import { metrics } from './modules/metrics.js';
import * as operationalAlerts from './modules/operationsAlerts.js';


const app=express();
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false}));
app.use(requestId);
app.use(corsFromConfig(env.ALLOWED_ORIGINS.split(',').map(x=>x.trim()).filter(Boolean)));
app.use(apiRateLimit);
app.use(express.json({limit:'256kb',strict:true,verify:(req,_res,buf)=>{req.rawBody=Buffer.from(buf);}}));
app.get('/health',(_req,res)=>res.json({success:true,data:{status:'ok'}}));
app.get('/metrics', metrics);
app.get('/ready',async(req,res)=>{try{await query('SELECT 1');await pingLiveStore();res.json({success:true,data:{status:'ready'}});}catch(e){res.status(503).json({success:false,error:{code:'NOT_READY',message:'Required services are unavailable'},requestId:req.requestId});}});
app.post('/api/v1/auth/admin/login',authRateLimit,login);
const admins=authenticate;
app.get('/api/v1/admin/me',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','TICKETING_ADMIN','CUSTOMER_SERVICE_ADMIN','DATA_REPORTING_ADMIN','NOTIFICATION_ADMIN','MARKETING_ADMIN'),(req,res)=>res.json({success:true,data:{user:req.auth}}));
app.get('/api/v1/admin/admins',admins,authorize('SUPER_ADMIN'),listAdmins);
app.post('/api/v1/admin/admins',admins,authorize('SUPER_ADMIN'),createAdmin);
app.patch('/api/v1/admin/admins/:id',admins,authorize('SUPER_ADMIN'),updateAdmin);
app.get('/api/v1/admin/audit-log',admins,authorize('SUPER_ADMIN'),getAuditLog);

app.get('/api/v1/admin/wilayas',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.listWilayas);
app.post('/api/v1/admin/wilayas',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.createWilaya);
app.patch('/api/v1/admin/wilayas/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.updateWilaya);
app.delete('/api/v1/admin/wilayas/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.deleteWilaya);
app.get('/api/v1/admin/wilayas/:wilayaId/cities',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.listCities);
app.post('/api/v1/admin/cities',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.createCity);
app.patch('/api/v1/admin/cities/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.updateCity);
app.delete('/api/v1/admin/cities/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.deleteCity);
app.get('/api/v1/admin/operators',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.listOperators);
app.post('/api/v1/admin/operators',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.createOperator);
app.patch('/api/v1/admin/operators/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.updateOperator);
app.delete('/api/v1/admin/operators/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.deleteOperator);
app.get('/api/v1/admin/routes',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.listRoutes);
app.post('/api/v1/admin/routes',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.createRoute);
app.patch('/api/v1/admin/routes/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.updateRoute);
app.delete('/api/v1/admin/routes/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.deleteRoute);
app.get('/api/v1/admin/routes/:routeId/directions',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.listDirections);
app.post('/api/v1/admin/directions',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.createDirection);
app.patch('/api/v1/admin/directions/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.updateDirection);
app.delete('/api/v1/admin/directions/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.deleteDirection);
app.get('/api/v1/admin/stops',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.listStops);
app.post('/api/v1/admin/stops',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.createStop);
app.patch('/api/v1/admin/stops/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.updateStop);
app.delete('/api/v1/admin/stops/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.deleteStop);
app.get('/api/v1/admin/directions/:directionId/stops',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.listRouteStops);
app.post('/api/v1/admin/route-stops',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.createRouteStop);
app.patch('/api/v1/admin/route-stops/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.updateRouteStop);
app.delete('/api/v1/admin/route-stops/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),transport.deleteRouteStop);

app.get('/api/v1/admin/buses',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.listBuses);
app.post('/api/v1/admin/buses',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.createBus);
app.patch('/api/v1/admin/buses/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.updateBus);
app.delete('/api/v1/admin/buses/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.deleteBus);
app.get('/api/v1/admin/devices',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.listDevices);
app.post('/api/v1/admin/devices',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.createDevice);
app.patch('/api/v1/admin/devices/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.updateDevice);
app.delete('/api/v1/admin/devices/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.deleteDevice);
app.get('/api/v1/admin/drivers',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.listDrivers);
app.post('/api/v1/admin/drivers',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.createDriver);
app.patch('/api/v1/admin/drivers/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.updateDriver);
app.delete('/api/v1/admin/drivers/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),fleet.deleteDriver);

app.get('/api/v1/admin/trips',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),trips.listTrips);
app.post('/api/v1/admin/trips',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),trips.createTrip);
app.patch('/api/v1/admin/trips/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),trips.updateTrip);
app.delete('/api/v1/admin/trips/:id',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),trips.deleteTrip);
app.post('/api/v1/admin/trips/:id/start',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),trips.startTrip);
app.post('/api/v1/admin/trips/:id/at-stop',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),trips.markAtStop);
app.post('/api/v1/admin/trips/:id/at-terminal',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),trips.markAtTerminal);
app.post('/api/v1/admin/trips/:id/confirm-return',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),trips.confirmReturn);
app.post('/api/v1/admin/trips/:id/end',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN'),trips.endTrip);

// ETA: public passenger endpoints; historical observation ingestion is Operations-only.
app.get('/api/v1/eta/buses/:id',eta.getBusEta);
app.get('/api/v1/eta/trips/:id',eta.getTripEta);
app.get('/api/v1/eta/directions/:directionId',eta.listRouteEta);
app.post('/api/v1/admin/eta/observations',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),eta.createTravelObservation);

// Public passenger APIs: no login required.
app.get('/api/v1/public/routes',passenger.listPublicRoutes);
app.get('/api/v1/public/routes/:id',passenger.getPublicRoute);
app.get('/api/v1/public/stops',passenger.listPublicStops);
app.get('/api/v1/public/buses',passenger.getPublicBuses);
app.get('/api/v1/public/journey-plan',passenger.planJourney);

// Passenger account and OTP APIs. OTP delivery is provider-agnostic; development exposes DEV_OTP_CODE only outside production.
app.post('/api/v1/auth/passenger/otp/request',authRateLimit,account.requestOtp);
app.post('/api/v1/auth/passenger/otp/verify',authRateLimit,account.verifyOtp);
app.get('/api/v1/passenger/me',authenticatePassenger,account.me);
app.patch('/api/v1/passenger/me',authenticatePassenger,account.completeProfile);
app.post('/api/v1/passenger/phones',authenticatePassenger,account.addPhone);
app.post('/api/v1/passenger/phones/verify',authenticatePassenger,account.verifyAdditionalPhone);

// Passenger occupancy: read is public; boarding/exit requires a verified passenger account.
app.get('/api/v1/public/buses/:busId/occupancy',occupancy.getBusOccupancy);
app.post('/api/v1/passenger/occupancy/events',authenticatePassenger,occupancy.event);


// Payments and refunds. Provider-specific gateways call the generic signed webhook endpoint.
app.post('/api/v1/passenger/payments',authenticatePassenger,payments.createPayment);
app.get('/api/v1/passenger/payments',authenticatePassenger,payments.myPayments);
app.post('/api/v1/payments/webhooks/:provider',payments.providerWebhook);
app.post('/api/v1/passenger/refunds',authenticatePassenger,payments.createRefund);
app.get('/api/v1/passenger/refunds',authenticatePassenger,payments.myRefunds);
app.get('/api/v1/admin/refunds',admins,authorize('SUPER_ADMIN','TICKETING_ADMIN','CUSTOMER_SERVICE_ADMIN'),payments.listRefunds);
app.patch('/api/v1/admin/refunds/:id/review',admins,authorize('SUPER_ADMIN','TICKETING_ADMIN','CUSTOMER_SERVICE_ADMIN'),payments.reviewRefund);
app.post('/api/v1/admin/refunds/:id/process',admins,authorize('SUPER_ADMIN','TICKETING_ADMIN'),payments.processRefund);

// Notifications and service alerts.
app.get('/api/v1/public/service-alerts',notifications.listActiveAlerts);
app.get('/api/v1/passenger/notifications',authenticatePassenger,notifications.myNotifications);
app.get('/api/v1/passenger/notification-preferences',authenticatePassenger,notifications.getPreferences);
app.patch('/api/v1/passenger/notification-preferences',authenticatePassenger,notifications.updatePreferences);
app.post('/api/v1/admin/notifications',admins,authorize('SUPER_ADMIN','NOTIFICATION_ADMIN','CUSTOMER_SERVICE_ADMIN','MARKETING_ADMIN'),notifications.sendNotification);
app.post('/api/v1/admin/service-alerts',admins,authorize('SUPER_ADMIN','NOTIFICATION_ADMIN','OPERATIONS_ADMIN'),notifications.createAlert);
app.patch('/api/v1/admin/service-alerts/:id',admins,authorize('SUPER_ADMIN','NOTIFICATION_ADMIN','OPERATIONS_ADMIN'),notifications.updateAlert);
app.delete('/api/v1/admin/service-alerts/:id',admins,authorize('SUPER_ADMIN','NOTIFICATION_ADMIN','OPERATIONS_ADMIN'),notifications.deleteAlert);
app.post('/api/v1/admin/service-alerts/broadcast',admins,authorize('SUPER_ADMIN','NOTIFICATION_ADMIN','MARKETING_ADMIN'),notifications.broadcastAlert);


// Ticketing: pricing/offers are managed by Ticketing/Marketing admins; passengers own their tickets.
app.get('/api/v1/ticketing/offers',ticketing.listOffers);
app.get('/api/v1/ticketing/price',ticketing.price);
app.get('/api/v1/passenger/tickets',authenticatePassenger,ticketing.myTickets);
app.post('/api/v1/passenger/tickets',authenticatePassenger,ticketing.purchaseTicket);
app.post('/api/v1/validator/tickets/validate',ticketing.validateTicket);
app.get('/api/v1/validator/sync',ticketing.syncValidator);
app.patch('/api/v1/admin/devices/:id/validator-key',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','TICKETING_ADMIN'),ticketing.setValidatorKey);
app.post('/api/v1/admin/ticketing/offers',admins,authorize('SUPER_ADMIN','TICKETING_ADMIN','MARKETING_ADMIN'),ticketing.createOffer);
app.patch('/api/v1/admin/ticketing/offers/:id',admins,authorize('SUPER_ADMIN','TICKETING_ADMIN','MARKETING_ADMIN'),ticketing.updateOffer);
app.delete('/api/v1/admin/ticketing/offers/:id',admins,authorize('SUPER_ADMIN','TICKETING_ADMIN','MARKETING_ADMIN'),ticketing.deleteOffer);

app.get('/api/v1/tracking/live',authenticate,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),(req,res)=>import('./modules/tracking/tracking.js').then(m=>m.listLiveBuses(req,res)));
app.get('/api/v1/tracking/buses/:id/live',authenticate,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),(req,res)=>import('./modules/tracking/tracking.js').then(m=>m.getBusLive(req,res)));
app.get('/api/v1/tracking/buses/:id/telemetry',authenticate,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),(req,res)=>import('./modules/tracking/tracking.js').then(m=>m.listBusTelemetry(req,res)));

// Operations dashboard and Data/Reporting APIs.
app.get('/api/v1/admin/dashboard/overview',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),reporting.overview);
app.get('/api/v1/admin/dashboard/operations',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),reporting.operations);
app.get('/api/v1/admin/operational-alerts',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),operationalAlerts.listOperationalAlerts);
app.post('/api/v1/admin/operational-alerts/:id/acknowledge',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),operationalAlerts.acknowledgeOperationalAlert);
app.post('/api/v1/admin/operational-alerts/:id/resolve',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),operationalAlerts.resolveOperationalAlert);
app.get('/api/v1/admin/reports/trips',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),reporting.tripsReport);
app.get('/api/v1/admin/reports/occupancy',admins,authorize('SUPER_ADMIN','OPERATIONS_ADMIN','DATA_REPORTING_ADMIN'),reporting.occupancyReport);
app.get('/api/v1/admin/reports/ticketing',admins,authorize('SUPER_ADMIN','TICKETING_ADMIN','DATA_REPORTING_ADMIN'),reporting.ticketingReport);
app.get('/api/v1/admin/reports/notifications',admins,authorize('SUPER_ADMIN','NOTIFICATION_ADMIN','DATA_REPORTING_ADMIN'),reporting.notificationsReport);
export default app;


app.use(notFound); app.use(errorHandler);
