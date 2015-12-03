var async = require('async');
var Uavtalk = require("uavtalk");
var EventEmitter = require('events').EventEmitter;
var SerialPort = require("serialport").SerialPort;

var objMan = new Uavtalk.ObjectManager("./openpilot_definitions");

async.waterfall([ function(callback) {
	objMan.init(function() {
		callback();
	});
}, function(callback) {
	var sp = new SerialPort("/dev/ttyAMA0", {
		baudrate : 57600
	});
	objMan.output_stream = function(data) {
		console.log(data);
		sp.write(data, function() {
			sp.drain();
		});
	};
	sp.on("data", objMan.input_stream);
	sp.on("open", function() {
		callback();
	});
}, function(callback) {
	objMan.requestObject("GCSTelemetryStats", function(obj) {
		callback(obj);
	});
}, function(callback, gtsObj) {
	console.log(gtsObj);
	objMan.requestObject("FlightTelemetryStats", function(obj) {
		callback(obj);
	});
}, function(callback, ftsObj) {
	console.log(ftsObj);
	if (ftsObj && ftsObj.Status == 0) {
		gtsObj.Status == 1;
		objMan.updateObject(gtsObj);
	}
} ], function(err, result) {

});
