var async = require('async');
var Uavtalk = require("uavtalk");
var EventEmitter = require('events').EventEmitter;
var SerialPort = require("serialport").SerialPort;

var objMan = new Uavtalk.ObjectManager("./openpilot_definitions");
var gtsObj;
var ftsObj;

function getBlankGtsObj() {
	var gtsObj = {};
	gtsObj.TxDataRate = 0;
	gtsObj.TxBytes = 0;
	gtsObj.TxFailures = 0;
	gtsObj.TxRetries = 0;
	gtsObj.RxDataRate = 0;
	gtsObj.RxBytes = 0;
	gtsObj.RxFailures = 0;
	gtsObj.RxSyncErrors = 0;
	gtsObj.RxCrcErrors = 0;
	gtsObj.Status = 0;
	gtsObj.name = "GCSTelemetryStats";
	gtsObj.object_id = objMan.getObjectId(gtsObj.name);
	return gtsObj;
}

var connecting = false;

async.waterfall([ function(callback) {
	objMan.init(function() {
		callback(null);
	});
}, function(callback) {
	var sp = new SerialPort("/dev/ttyAMA0", {
		baudrate : 57600
	});
	objMan.output_stream = function(data) {
		console.log("data");
		console.log(data);
		sp.write(data, function() {
			sp.drain();
		});
	};
	sp.on("data", objMan.input_stream);
	sp.on("open", function() {
		callback(null);
	});
}, function(callback) {
	objMan.requestObject("FlightTelemetryStats", function(obj) {
		callback(null, obj);
	});
}, function(obj, callback) {
	var connection = function(obj) {
		ftsObj = obj;
		console.log(ftsObj);
		gtsObj = getBlankGtsObj();
		if (ftsObj.Status == 0) {
			gtsObj.Status = 1;
			console.log(gtsObj);
			objMan.updateObject(gtsObj);
		} else if (ftsObj.Status == 2) {
			gtsObj.Status = 2;
			console.log(gtsObj);
			objMan.updateObject(gtsObj);
		} else if (ftsObj.Status == 3) {
			console.log("connected");
			callback(null);
			return;
		}
		objMan.requestObject("FlightTelemetryStats", connection);
	};
	if (connecting == false) {
		connection(obj);
	}
	connecting = true;
}, function(callback) {
	callback(null);
} ], function(err, result) {

});
