// This library parses raw uavtalk packets from given data.
// The higher level system is responsible for receiving data over
// a stream,file,whatever, and providing that data to this module
// which will then decode the raw packets and call the callback
// function when a full packet has been received.

var _ = require('underscore');
var bufferpack = require('bufferpack');

var types = {
	0x0 : "OBJ",
	0x1 : "OBJ_REQ",
	0x2 : "OBJ_ACK",
	0x3 : "OBJ_ACK",
	0x4 : "OBJ_NAK",
};

function UavtalkPacketHandler(callback) {
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
	return {
		pack : function(obj)
		{
			
		}
		unpack : function(data) {
			var index = 0;
			var datalen = data.length;

			while (index < datalen) {
				// console.log("TOP state: " + state + ", index: " + index + ",
				// datalen: " + datalen);
				if (state === 0) {
					// sync
					if (data[index] !== 0x3c) {
						console.error("Missed sync");
						++index;
					} else {
						headerbuffer[0] = 0x3c;
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

exports.UavtalkPacketHandler = UavtalkPacketHandler;
