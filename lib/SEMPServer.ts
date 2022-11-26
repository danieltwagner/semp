/**
 * @fileOverview http server handling SEMP requests
 * @author Paul Orlob
 */

import express from 'express';
import Gateway from "./Gateway";
import {Server} from "http";
import Device2EM, {DeviceInfoType, DeviceStatusType, PlanningRequestType} from "./Device2EM";
import Device from "./Device";
import {js2xml, xml2js} from "xml-js";
import EM2Device from './EM2Device'

class SEMPServer {

    private app: express.Application;
    private server: Server | undefined;

    /**
     * Creates a new SEMP Server instance
     * @param uuid - Globally unique uuid
     * @param ipAddress - ip address of the server
     * @param port - port to run the server on
     * @param descriptionXml Description XML string
     * @param gateway Gateway
     */
    constructor(uuid: string,
                ipAddress: string,
                private port: number,
                private descriptionXml: string,
                private gateway: Gateway) {


        this.app = express();
        this.initRoutes()
    }

    /**
     * Initializes SEMP routes
     */
    private initRoutes(): void {
        this.app.get('/description.xml', (req, res) => {
            res.set('Content-Type', 'text/xml');
            res.send(this.descriptionXml)
        });

        // All devices
        this.app.get('/semp/', (req, res) => {
            console.log("Requested all devices. " + req.url);
            // console.log(JSON.stringify(req.query));
            let deviceList = this.gateway.getAllDevices()
            let devices: Device2EM = SEMPServer.convertDevices(deviceList);
            console.log(JSON.stringify(deviceList));
            res.send(SEMPServer.convertJSToXML(devices))
        });

        this.app.post('/semp/', (req, res) => {
            let body: string = "";
            req.on("data", (chunk => {
                body += chunk
            }));
            req.on("end", () => {
                let json = xml2js(body, {compact: true, ignoreDeclaration: true, ignoreDoctype: true, nativeType: true});
                this.gateway.onSEMPMessage(SEMPServer.convertEM2Device(json));
                res.end()
            });
        });

        this.app.all('*', (req, res) => {
            console.log("Unmatched url... " + req.url);
            console.log(JSON.stringify(req.query));
            res.end()
        });
    }

    public static convertJSToXML(js: any): string{
        let rawJs = {
            _declaration: {
                _attributes: {
                    version: "1.0",
                    encoding: "utf-8"
                }
            },
            Device2EM: js
        };
        return js2xml(rawJs, {compact: true, spaces: 4});
    }

    public static convertEM2Device(em2dev: any): EM2Device{
        em2dev = em2dev.EM2Device;

        return {
            DeviceControl: {
                DeviceId: em2dev.DeviceControl.DeviceId._text,
                On: em2dev.DeviceControl.On._text,
                RecommendedPowerConsumption: em2dev.DeviceControl.RecommendedPowerConsumption._text,
                Timestamp: em2dev.DeviceControl.Timestamp._text
            }
        }
    }

    public static convertDevices(devices: Array<Device>): Device2EM {
        let devInfos: Array<DeviceInfoType> = [];
        let devStatuses: Array<DeviceStatusType> = [];
        let devPlanningRequests: Array<PlanningRequestType> = [];

        for (let d of devices) {
            devInfos.push(d.deviceInfo);
            devStatuses.push(d.deviceStatus);
            if (d.planningRequest.Timeframe.length != 0) {
                devPlanningRequests.push(d.planningRequest)
            }
        }

        return {
            _attributes: {
                xmlns: "http://www.sma.de/communication/schema/SEMP/v1"
            },
            DeviceInfo: devInfos,
            DeviceStatus: devStatuses,
            PlanningRequest: devPlanningRequests
        }

    }

    /**
     * Start the server.
     * @returns promise that resolves when server has started.
     */
    start(): Promise<void> {
        if (!this.port) {
            throw TypeError("Port must be specified!")
        }
        if (this.port < 0) {
            throw TypeError("Port has to be greater than 0!")
        }

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, () => {
                console.log("SEMP server listening on " + this.port);
                resolve()
            })
        });
    }

    /**
     * Stops the server.
     * @returns promise that resolves when the server is stopped.
     */
    stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.server != null) {
                this.server.close(() => {
                    resolve()
                })
            } else {
                reject()
            }
        })
    }

}

export default SEMPServer;
