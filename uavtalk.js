// This library parses raw uavtalk packets from given data.
// The higher level system is responsible for receiving data over
// a stream,file,whatever, and providing that data to this module
// which will then decode the raw packets and call the callback
// function when a full packet has been received.

var _ = require('underscore');
var bufferpack = require('bufferpack');

var SYNC = 0x3C;
var VERSION_MASK = 0xFC;
var VERSION = 0x20;
var TYPE_MASK = 0x03;
var TYPE_OBJ = 0x00;
var TYPE_OBJ_REQ = 0x01;
var TYPE_OBJ_ACK = 0x02;
var TYPE_ACK = 0x03;

var MIN_HEADER_LENGTH = 10;// # sync(1), type (1), size(2), object ID(4),
// instance ID(2)
var MAX_HEADER_LENGTH = 12;// # sync(1), type (1), size(2), object ID (4),
// instance ID(2), TIMESTAMP(2 not used in single
// objects)

var MAX_PAYLOAD_LENGTH = 255;//
var CHECKSUM_LENGTH = 1;//
var MAX_PACKET_LENGTH = (MAX_HEADER_LENGTH + MAX_PAYLOAD_LENGTH + CHECKSUM_LENGTH);//

var types = {
	0x0 : "OBJ",
	0x1 : "OBJ_REQ",
	0x2 : "OBJ_ACK",
	0x3 : "OBJ_ACK",
	0x4 : "OBJ_NAK",
};

var CrcTable = [ 0x00, 0x07, 0x0e, 0x09, 0x1c, 0x1b, 0x12, 0x15, 0x38, 0x3f, 0x36, 0x31, 0x24, 0x23, 0x2a, 0x2d, 0x70, 0x77, 0x7e, 0x79, 0x6c, 0x6b, 0x62, 0x65, 0x48, 0x4f, 0x46, 0x41, 0x54, 0x53,
		0x5a, 0x5d, 0xe0, 0xe7, 0xee, 0xe9, 0xfc, 0xfb, 0xf2, 0xf5, 0xd8, 0xdf, 0xd6, 0xd1, 0xc4, 0xc3, 0xca, 0xcd, 0x90, 0x97, 0x9e, 0x99, 0x8c, 0x8b, 0x82, 0x85, 0xa8, 0xaf, 0xa6, 0xa1, 0xb4, 0xb3,
		0xba, 0xbd, 0xc7, 0xc0, 0xc9, 0xce, 0xdb, 0xdc, 0xd5, 0xd2, 0xff, 0xf8, 0xf1, 0xf6, 0xe3, 0xe4, 0xed, 0xea, 0xb7, 0xb0, 0xb9, 0xbe, 0xab, 0xac, 0xa5, 0xa2, 0x8f, 0x88, 0x81, 0x86, 0x93, 0x94,
		0x9d, 0x9a, 0x27, 0x20, 0x29, 0x2e, 0x3b, 0x3c, 0x35, 0x32, 0x1f, 0x18, 0x11, 0x16, 0x03, 0x04, 0x0d, 0x0a, 0x57, 0x50, 0x59, 0x5e, 0x4b, 0x4c, 0x45, 0x42, 0x6f, 0x68, 0x61, 0x66, 0x73, 0x74,
		0x7d, 0x7a, 0x89, 0x8e, 0x87, 0x80, 0x95, 0x92, 0x9b, 0x9c, 0xb1, 0xb6, 0xbf, 0xb8, 0xad, 0xaa, 0xa3, 0xa4, 0xf9, 0xfe, 0xf7, 0xf0, 0xe5, 0xe2, 0xeb, 0xec, 0xc1, 0xc6, 0xcf, 0xc8, 0xdd, 0xda,
		0xd3, 0xd4, 0x69, 0x6e, 0x67, 0x60, 0x75, 0x72, 0x7b, 0x7c, 0x51, 0x56, 0x5f, 0x58, 0x4d, 0x4a, 0x43, 0x44, 0x19, 0x1e, 0x17, 0x10, 0x05, 0x02, 0x0b, 0x0c, 0x21, 0x26, 0x2f, 0x28, 0x3d, 0x3a,
		0x33, 0x34, 0x4e, 0x49, 0x40, 0x47, 0x52, 0x55, 0x5c, 0x5b, 0x76, 0x71, 0x78, 0x7f, 0x6a, 0x6d, 0x64, 0x63, 0x3e, 0x39, 0x30, 0x37, 0x22, 0x25, 0x2c, 0x2b, 0x06, 0x01, 0x08, 0x0f, 0x1a, 0x1d,
		0x14, 0x13, 0xae, 0xa9, 0xa0, 0xa7, 0xb2, 0xb5, 0xbc, 0xbb, 0x96, 0x91, 0x98, 0x9f, 0x8a, 0x8d, 0x84, 0x83, 0xde, 0xd9, 0xd0, 0xd7, 0xc2, 0xc5, 0xcc, 0xcb, 0xe6, 0xe1, 0xe8, 0xef, 0xfa, 0xfd,
		0xf4, 0xf3 ];
function Crc(object) {
	var crc = 0;
	var self = {

		reset : function() {
			self.crc = 0;
		},

		read : function() {
			return self.crc;
		},

		add : function(value) {
			self.crc = CrcTable[self.crc ^ (value & 0xff)];
		},

		addList : function(values) {
			for ( var i = 0; i < values.length; i++) {
				self.add(values[i]);
			}
		}
	};
	return self;
}

function UavtalkPacketHandler() {
	return {
		getPacket : function(type, object_id, data) {
			var length = MIN_HEADER_LENGTH;
			if (data != null) {
				length += data.length;
			}
			var buffer = new Buffer(length + 1);
			var header = new Buffer([ SYNC, type | VERSION, 0, 0, 0, 0, 0, 0, 0, 0 ]);

			header[2] = length & 0xFF;
			header[3] = (length >> 8) & 0xFF;
			for ( var i = 4; i < 8; i++) {
				header[i] = object_id & 0xff;
				object_id >>= 8;
			}
			header.copy(buffer, 0);

			var crc = Crc();
			crc.addList(header);

			if (data != null) {
				crc.addList(data);
				data.copy(buffer, header.length);
			}
			buffer[length] = crc.read();

			return buffer;
		},
		getRequestPacket : function(object_id) {
			return this.getPacket(TYPE_OBJ_REQ, object_id, null);
		},
		getParser : function(callback) {
			var headerbuffer = new Buffer(12);
			var headerbufferlen = 0;
			var databuffer = null;
			var datatoread = 0;
			var state = 0;

			var message = {
				type : null,
				object_id : null,
				instance_id : null,
				data : null,
				crc : null
			};
			return function(data) {
				var index = 0;
				var datalen = data.length;

				while (index < datalen) {
					// console.log("TOP state: " + state + ", index: " + index +
					// ",
					// datalen: " + datalen);
					if (state === 0) {
						// sync
						if (data[index] !== SYNC) {
							console.error("Missed sync");
							++index;
						} else {
							headerbuffer[0] = SYNC;
							headerbufferlen = 1;
							++state;
							++index;
						}
					} else if (state === 1) {
						// Read the rest of the header into the buffer
						// 10 bytes total
						var tocopy = Math.min(datalen - index, 10 - headerbufferlen);
						data.copy(headerbuffer, headerbufferlen, index, index + tocopy);
						headerbufferlen += tocopy;
						index += tocopy;
						if (headerbufferlen === 10) {
							// Decode the header
							var header = bufferpack.unpack("<BBHiH", headerbuffer);
							datatoread = header[2] - headerbufferlen;
							if (datatoread < 0) {
								datatoread = 0;
							}
							if (datatoread > 255) {
								datatoread = 255;
							}
							databuffer = new Buffer(datatoread);

							message.type = types[header[1] & 0x0f];
							message.object_id = header[3];
							message.instance_id = header[4];
							message.data = databuffer;
							++state;
						}
					} else if (state === 2) {
						var tocopy = Math.min(datalen - index, datatoread);
						data.copy(databuffer, databuffer.length - datatoread, index, index + tocopy);
						datatoread -= tocopy;
						index += tocopy;

						if (datatoread === 0) {
							++state;
						}
					} else if (state === 3) {
						message.crc = data[index];
						callback(message);
						index++;
						state = 0;
					} else {
						throw ("Unknown state");
					}
					if (index > datalen) {
						throw ("SOMETHING IS WRONG");
					}
				}
			}
		}
	}
}

function endsWith(str, suffix) {
	return str.indexOf(suffix, str.length - suffix.length) !== -1;
};

var UavtalkObjMetadataHelper = (function() {
	/**
	 * Object metadata, each object has a meta object that holds its metadata.
	 * The metadata define properties for each object and can be used by
	 * multiple modules (e.g. telemetry and logger)
	 * 
	 * The object metadata flags are packed into a single 16 bit integer. The
	 * bits in the flag field are defined as:
	 * 
	 * Bit(s) Name Meaning ------ ---- ------- 0 access Defines the access level
	 * for the local transactions (readonly=1 and readwrite=0) 1 gcsAccess
	 * Defines the access level for the local GCS transactions (readonly=1 and
	 * readwrite=0), not used in the flight s/w 2 telemetryAcked Defines if an
	 * ack is required for the transactions of this object (1:acked, 0:not
	 * acked) 3 gcsTelemetryAcked Defines if an ack is required for the
	 * transactions of this object (1:acked, 0:not acked) 4-5
	 * telemetryUpdateMode Update mode used by the telemetry module
	 * (UAVObjUpdateMode) 6-7 gcsTelemetryUpdateMode Update mode used by the GCS
	 * (UAVObjUpdateMode) 8-9 loggingUpdateMode Update mode used by the logging
	 * module (UAVObjUpdateMode)
	 */
	var UAVOBJ_ACCESS_SHIFT = 0;
	var UAVOBJ_GCS_ACCESS_SHIFT = 1;
	var UAVOBJ_TELEMETRY_ACKED_SHIFT = 2;
	var UAVOBJ_GCS_TELEMETRY_ACKED_SHIFT = 3;
	var UAVOBJ_TELEMETRY_UPDATE_MODE_SHIFT = 4;
	var UAVOBJ_GCS_TELEMETRY_UPDATE_MODE_SHIFT = 6;
	var UAVOBJ_LOGGING_UPDATE_MODE_SHIFT = 8;
	var UAVOBJ_UPDATE_MODE_MASK = 0x3;

	var SET_BITS = function(_var, shift, value, mask) {
		_var = (_var & ~(mask << shift)) | (value << shift);
		return _var;
	};

	return {
		UAVObjAccessType : {
			ACCESS_READWRITE : 0,
			ACCESS_READONLY : 1
		},
		UAVObjUpdateMode : {
			UPDATEMODE_MANUAL : 0,
			/**
			 * Manually update object, by calling the updated() function
			 */
			UPDATEMODE_PERIODIC : 1,
			/**
			 * Automatically update object at periodic intervals
			 */
			UPDATEMODE_ONCHANGE : 2,
			/**
			 * Only update object when its data changes
			 */
			UPDATEMODE_THROTTLED : 3
		/**
		 * Object is updated on change, but not more often than the interval
		 * time
		 */
		},

		getObjMetadataId : function(id) {
			return ((id) + 1);
		},

		getObjMetadataName : function(name) {
			return (name + ".Metadata");
		},

		setFlightAccess : function(metadata, mode) {
			metadata.flags = SET_BITS(metadata.flags, UAVOBJ_ACCESS_SHIFT, mode, 1);
		},

		setGcsAccess : function(metadata, mode) {
			metadata.flags = SET_BITS(metadata.flags, UAVOBJ_GCS_ACCESS_SHIFT, mode, 1);
		},

		setFlightTelemetryUpdateMode : function(metadata, val) {
			metadata.flags = SET_BITS(metadata.flags, UAVOBJ_TELEMETRY_UPDATE_MODE_SHIFT, val, UAVOBJ_UPDATE_MODE_MASK);
		},

		setGcsTelemetryUpdateMode : function(metadata, val) {
			metadata.flags = SET_BITS(metadata.flags, UAVOBJ_GCS_TELEMETRY_UPDATE_MODE_SHIFT, val, UAVOBJ_UPDATE_MODE_MASK);
		}
	};
})();

function UavtalkObjectManager(objpath) {
	// console.log("Reading json object defs...");
	var packetHandler = UavtalkPacketHandler();
	var fs = require('fs');
	var path = require('path');

	var uavobjects = {}
	var uavobject_name_index = {}
	var ready = false;

	var get_unpackstr = function(fields) {
		var unpackstr = "<"
		_.each(fields, function(f) {
			var u;
			if (f.type === 0) {
				// int8
				u = "b"
			} else if (f.type === 1) {
				// int16
				u = "h"
			} else if (f.type === 2) {
				// int32
				u = "i"
			} else if (f.type === 3) {
				// uint8
				u = "B"
			} else if (f.type === 4) {
				// uint16
				u = "H"
			} else if (f.type === 5) {
				// uint32
				u = "I"
			} else if (f.type === 6) {
				// float
				u = "f"
			} else if (f.type === 7) {
				// enum
				u = "B"
			} else {
				throw ("Unknown field type: " + f.type);
			}
			if (f.numElements > 1) {
				var _u = "";
				for ( var i = 0; i < f.numElements; i++) {
					_u += u + "(" + f.name.replace("_", "") + "Idx" + i + ")";
				}
				u = _u;
			} else {
				u = u + "(" + f.name.replace("_", "") + ")";
			}
			unpackstr += u;
		});
		return unpackstr;
	};

	var create_objMetadataDef = function(object_id, name) {
		var json = {
			"name" : name,
			"object_id" : object_id,
			"unpackstr" : "",
			"fields" : [ {
				"name" : "flags",
				"type" : 4,
				"numElements" : 1
			}, {
				"name" : "telemetryUpdatePeriod",
				"type" : 4,
				"numElements" : 1
			}, {
				"name" : "gcsTelemetryUpdatePeriod",
				"type" : 4,
				"numElements" : 1
			}, {
				"name" : "loggingUpdatePeriod",
				"type" : 4,
				"numElements" : 1
			} ]
		};
		json.unpackstr = get_unpackstr(json.fields);
		return json;
	};

	var init = function(callback) {
		fs.readdir(objpath, function(err, files) {
			if (err)
				throw err;

			var count = 1;

			function checkdone() {
				count--;
				if (count === 0) {
					ready = true;
					if (callback) {
						callback();
					}
				}
			}

			_.each(files, function(filename) {
				if (!endsWith(filename, ".json")) {
					return;
				}
				++count;
				var filename = path.join(objpath, filename);
				fs.readFile(filename, function(err, data) {
					var json = JSON.parse(data);
					json.unpackstr = get_unpackstr(json.fields);
					uavobjects[json.object_id] = json;
					uavobject_name_index[json.name] = json.object_id;
					var objMetadata_id = UavtalkObjMetadataHelper.getObjMetadataId(json.object_id);
					var objMetadata_name = UavtalkObjMetadataHelper.getObjMetadataName(json.name);
					var objMetadata = create_objMetadataDef(objMetadata_id, objMetadata_name);
					uavobjects[objMetadata_id] = objMetadata
					uavobject_name_index[objMetadata.name] = objMetadata.object_id;
					checkdone();
				});
			});
			checkdone();
		});
	}

	function unpack_obj(objdef, data) {
		var out = {};
		var unpacked = bufferpack.unpack(objdef.unpackstr, data);
		if (!unpacked) {
			console.log("Couldn't unpack " + objdef.name);
			return null;
		}
		return unpacked;
	}

	function pack_obj(objdef, obj) {
		var values = [];
		for ( var i in obj) {
			values.push(obj[i]);
		}
		var packed = bufferpack.pack(objdef.unpackstr, values);
		if (!packed) {
			console.log("Couldn't pack " + objdef.name);
			return null;
		}
		return packed;
	}

	var warned = {};
	var request_id_map = {};

	var self = {
		init : init,
		ready : function() {
			return ready;
		},
		output_stream : function(data) {
		},
		input_stream : packetHandler.getParser(function(packet) {
			if (!self.ready()) {
				return;
			}
			var obj = uavobjects[packet.object_id];
			if (!obj) {
				return;
			}
			var instance = null;
			if (packet.type == "OBJ") {
				instance = self.deserialize(packet.object_id, packet.data);
			}
			obj.instance = instance;

			if (request_id_map[packet.object_id]) {
				var callback_ary = request_id_map[packet.object_id];
				request_id_map[packet.object_id] = null;
				callback_ary.forEach(function(callback) {
					callback(instance);
				});
			}
		}),
		deserialize : function(object_id, data) {
			var objdef = uavobjects[object_id];
			if (!objdef) {
				if (!warned[object_id]) {
					console.log("JSON Failed to find object");
					console.log(object_id);
					warned[object_id] = true;
				}
				return null;
			} else {
				var objdata = unpack_obj(objdef, data);
				objdata.name = objdef.name;
				objdata.object_id = object_id;
				return objdata;
			}
		},
		serialize : function(obj) {
			var objdef = uavobjects[obj.object_id];
			if (!objdef) {
				if (!warned[obj.object_id]) {
					console.log("JSON Failed to find object");
					console.log(packet);
					warned[obj.object_id] = true;
				}
				return null;
			} else {
				return pack_obj(objdef, obj);
			}
		},
		getObjectId : function(object_name) {
			return uavobject_name_index[object_name];
		},
		getObject : function(object_id, callback, blnRenew) {
			if (typeof (object_id) == 'string') {
				object_id = uavobject_name_index[object_id];
			}
			var objdef = uavobjects[object_id];
			if (!objdef) {
				return null;
			}
			if (objdef.instance && !blnRenew) {
				callback(objdef.instance);
			} else {
				if (request_id_map[object_id] == null) {
					request_id_map[object_id] = [ callback ];
					var request_func = function() {
						if (self.output_stream) {
							self.output_stream(packetHandler.getRequestPacket(object_id));
						}
						setTimeout(function() {
							if (request_id_map[object_id] != null) {
								request_func();
							}
						}, 1000);
					}
					request_func();
				} else {
					request_id_map[object_id].push(callback);
				}
			}
			return objdef.instance;
		},
		updateObject : function(obj) {
			var data = self.serialize(obj);
			if (self.output_stream) {
				self.output_stream(packetHandler.getPacket(TYPE_OBJ, obj.object_id, data));
			}
		}
	}
	return self;
}

module.exports = {
	ObjectManager : UavtalkObjectManager,
	PacketHandler : UavtalkPacketHandler,
	UavtalkObjMetadataHelper : UavtalkObjMetadataHelper
};
