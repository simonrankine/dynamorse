/* Copyright 2015 Christine S. MacNeill

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by appli cable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

var H = require('highland');
var pcap = require('../funnel/pcapInlet.js');
var udpToGrain = require('../valve/udpToGrain.js');
var grainToWavBuffers = require('../valve/grainToWavBuffers.js');
var fileSpigot = require('../spout/fileSpigot.js');
var SDP = require('../model/SDP.js');
var udpInlet = require('../funnel/udpInlet.js');
var grainToRTP = require('../valve/grainToRTP.js')
var udpSpigot = require('../spout/udpSpigot.js');
var dgram = require('dgram');

var inAudioSDP = `v=0
o=- 1452527302 1452527302 IN IP4 192.168.15.50
s=IP Studio Stream
t=0 0
m=audio 5000 RTP/AVP 102
c=IN IP4 232.113.33.205/32
a=source-filter:incl IN IP4 232.113.33.205 192.168.15.50
a=rtpmap:102 L24/48000/2
a=control:trackID=1
a=mediaclk:direct=746327777 rate=48000
a=extmap:1 urn:x-ipstudio:rtp-hdrext:origin-timestamp
a=extmap:2 urn:ietf:params:rtp-hdrext:smpte-tc 1600@48000/30
a=extmap:3 urn:x-ipstudio:rtp-hdrext:flow-id
a=extmap:4 urn:x-ipstudio:rtp-hdrext:source-id
a=extmap:5 urn:x-ipstudio:rtp-hdrext:grain-flags
a=extmap:7 urn:x-ipstudio:rtp-hdrext:sync-timestamp
a=extmap:9 urn:x-ipstudio:rtp-hdrext:grain-duration
a=ts-refclk:ptp=IEEE1588-2008:ec-46-70-ff-fe-00-51-83`;

var outAudioSDP = `v=0
o=- 1452527302 1452527302 IN IP4 192.168.15.140
s=Streampunk Stream
t=0 0
m=audio 5001 RTP/AVP 96
c=IN IP4 232.77.88.99/32
a=source-filter:incl IN IP4 232.77.88.99 192.168.15.140
a=rtpmap:96 L24/48000/2
a=control:trackID=1
a=mediaclk:direct=746327777 rate=48000
a=extmap:1 urn:x-ipstudio:rtp-hdrext:origin-timestamp
a=extmap:2 urn:ietf:params:rtp-hdrext:smpte-tc 1600@48000/30
a=extmap:3 urn:x-ipstudio:rtp-hdrext:flow-id
a=extmap:4 urn:x-ipstudio:rtp-hdrext:source-id
a=extmap:5 urn:x-ipstudio:rtp-hdrext:grain-flags
a=extmap:7 urn:x-ipstudio:rtp-hdrext:sync-timestamp
a=extmap:9 urn:x-ipstudio:rtp-hdrext:grain-duration
a=ts-refclk:ptp=IEEE1588-2008:ec-46-70-ff-fe-00-51-83`;

var inSddp = new SDP(inAudioSDP);
var outSdp = new SDP(outAudioSDP);

var server1 = dgram.createSocket('udp4');
var server2 = dgram.createSocket('udp4');

var mcastAddress = '232.113.33.205';
var netif = '192.168.15.140';
var port = 5000;

udpInlet(server1, mcastAddress, port, netif)
  .pipe(udpToGrain(sdp))
  .take(200)
  .doto(function (x) { console.log(JSON.stringify(x, null, 2)); })
  .pipe(grainToRTP(outSdp))
  .pipe(udpSpigot(server2, outSdp))
  .errors(function (e) { console.error(e); })
  .each(function (x) { console.log(JSON.stringify(x)) });
