var express = require('express');
var app = express();

var mongoose = require('mongoose');
var bodyParser = require('body-parser')

var Schema = mongoose.Schema;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

mongoose.connect('mongodb://beacondb:beacondb@nodecluster-shard-00-00-ldy3x.mongodb.net:27017,nodecluster-shard-00-01-ldy3x.mongodb.net:27017,nodecluster-shard-00-02-ldy3x.mongodb.net:27017/reservation?ssl=true&replicaSet=nodecluster-shard-0&authSource=admin&retryWrites=true',{
    useNewUrlParser:true
});

const accountSid = 'AC524398ea103ad3ea5638e9b1b9052d1c';
const authToken = '9ad5a3cae6884a052855dcece4e7f3a1';
const client = require('twilio')(accountSid, authToken);
const MessagingResponse = require('twilio').twiml.MessagingResponse;

var reservationschema = new Schema({
mobilenumber:{type:Number,required:true},
name:{type:String,required:true},
count:{type:Number,required:true},
requestedtime:Date,
waitingtime:String,
checkintime:Date,
checkouttime:Date,
Status:String,
Table:Number
});

var tableSchema = new Schema({

    table:{type:Number,required:true},
    size:{type:Number,required:true},
    status:{type:String,required:true},
    availableTime:Date,
    waiting:Number
});

const Reservation = mongoose.model('customers',reservationschema);
const Table = mongoose.model('tables',tableSchema);

app.post('/reservation',function(req,res){

    Reservation.find({'mobilenumber':req.body.mobilenumber,'Status':{'$ne':'Finished'}}).then(result=>{

      if (result.length == 0){
      const customer = new Reservation({

        mobilenumber:req.body.mobilenumber,
        name:req.body.name,
        count:req.body.count,
        requestedtime:new Date(),
        waitingtime:null,
        checkintime:null,
        checkouttime:null,
        Table:null,
        Status:null
      });

      customer.save().then(result => { 
        
        res.status(201).json({
            message:"created successfully",
            createdProduct:customer
        });

        sendMessage(customer,req,res);

     }).catch(err => {
         
        res.status(500).json({error:err});
     })
    }
    else {
        res.status(500).json({error:'Reservation with this Number already exists!!!! Please use a different number'});
    }
    })
});

app.post('/table',function(req,res){

    Table.find({table:req.body.tableNumber}).then(result => {

        if(result.length > 0){

            res.status(500).json({error:'Table Exists with same id !!! Please use a different id'});
        }

        else {

            const tabledetails = new Table({

                table:req.body.tableNumber,
                size:req.body.size,
                status:'Available',
                availableTime:null,
                waiting:0
            });
        
            tabledetails.save().then(result => { 
                
                res.status(201).json({
                    message:"created successfully",
                    createdProduct:tabledetails
                });
        
             }).catch(err => {
                 
                res.status(500).json({error:err});
             })

        }
    })


});

app.post('/sms', (req, res) => {

    let from = req.body.From;
    let to = req.body.To;
    let body = req.body.Body;

    var phone = Number(from.toString().substring(2));

    console.log(" from is " + from + " phone is " + phone);
    console.log(" to is " + to);
    console.log(" body is " + body);
    const twiml = new MessagingResponse();

    //console.log(" body uppercase " + body.toUpperCase() + body.toUpperCase() == 'STATUS');

    if (body.toUpperCase() === 'STATUS') {

    Reservation.find({"mobilenumber":phone,'Status':{'$ne':'Finished'}}).then(result =>{


        console.log(result);

       if (!(result.length > 0)){

        twiml.message('You dont have any reservations');
  
        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(twiml.toString());
       }

       else if (result[0].Status != 'Waiting for Checkin')
        {
            twiml.message('You have already checked in');
  
        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(twiml.toString());
        }

       else if (result[0].waitingtime == null){



                var gap = 15 - Math.round(((new Date().getTime() - result[0].requestedtime.getTime())/3600000)*60);

                if (gap< 0){

                twiml.message('Table is reserved for you. You need to check in as soon as possible');
  
                res.writeHead(200, {'Content-Type': 'text/xml'});
                res.end(twiml.toString());
                }

                else {

                twiml.message('Table is reserved for you. Please Checkin with in ' + gap + ' minutes');
  
                res.writeHead(200, {'Content-Type': 'text/xml'});
                res.end(twiml.toString());
                }
             
       }

       else {

        var gap = Math.round(((new Date().getTime() - result[0].requestedtime.getTime())/3600000)*60);
        var waiting = Number(result[0].waitingtime.split(" ")[0] )- gap;

        console.log(" gap is " +gap);
        console.log("waiting is " + waiting);

        Table.find({table:result[0].Table}).then(result => {

            if (waiting < 0 && result[0].status != 'Reserved'){

                twiml.message('Table is available');
  
                res.writeHead(200, {'Content-Type': 'text/xml'});
                res.end(twiml.toString());
            }

            else if (waiting < 0 && result[0].status == 'Reserved'){

                twiml.message('Estimated waiting time is ' + 15 + " minutes ");
  
                res.writeHead(200, {'Content-Type': 'text/xml'});
                res.end(twiml.toString());
            }
    
            else {

                 twiml.message('Estimated waiting time is ' + waiting + " minutes ");
  
                     res.writeHead(200, {'Content-Type': 'text/xml'});
                    res.end(twiml.toString());
            }

        }).catch(err =>{

        })
       }

    }).catch(error=>{

    })

}

else {

    twiml.message('Invalid Code \n only following codes are valid \n status');
  
        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(twiml.toString());
}
  });

function sendMessage(customer){

    var count = customer.count;
    var mobile = customer.mobilenumber;
    Table.find({
        $and:[
            {"size":{$gte:count}},{"status":"Available"}
        ]
    }).sort({"size":1}).then(result =>
        {
            if (result.length > 0){
                Reservation.updateOne(
                    {'mobilenumber':mobile,'Status':{'$ne':'Finished'}},
                    {$set:{Status:'Waiting for Checkin',Table:result[0].table}}
                ).then(result =>{
                     
                }).catch(err =>{
                    console.log(" reservation error " + err);
                })

                Table.updateOne({'table':result[0].table},{$set:{'status':'Checkin', waiting:result[0].waiting + 1,'availableTime':new Date().getTime() + 1000 * 60 * 90}})
                .then(result => {

                }).catch(err =>{
                     
                    console.log(" table error " + err);
                })

                client.messages
                .create({
                 body: 'Table is available, please check in with in 15 min',
                 from: '+17046650085',
                 to: mobile
   })
  .then(message => console.log(message.sid))
  .done();
                // send message to customer that table is available and 
                // needs to checkin within 15 min.

            }
            else {
                
                 Table.find({

                    "size":{$gte:count}
                 }).sort({"waiting":1,"status":1,"availableTime":1,"size":1}).then(result =>{

                    var available = result[0].availableTime;
                    var waiting =  Math.round(((available.getTime() - new Date().getTime())/3600000)*60);

                    Reservation.updateOne({"mobilenumber":mobile,'Status':{'$ne':'Finished'}},{$set:{waitingtime:waiting+" minutes",Status:'Waiting for Checkin',Table:result[0].table}})
                    .then(result =>{

                    }).catch(err =>{
                        
                    })

                    var changeTime = available.getTime() + 1000 * 60 *75;
                    Table.updateOne({table:result[0].table},{$set:{waiting:result[0].waiting + 1,'availableTime':changeTime}})
                    .then(result =>{

                    }).catch(err => {

                    })

                    // send message to customer that table will be available
                    // in (waiting time minutes), if waiting time is less than 15 min
                    // send message that table will be available in 15 min and you need
                    // to check in with in 15 min.

                client.messages
                .create({
                 body: 'All the tables are reserved, Estimated waiting time is ' + waiting + " minutes",
                 from: '+17046650085',
                 to: mobile
                })
            .then(message => console.log(message.sid))
            .done();
                    

                 }).catch(err =>{

                 })
                  
            }
        }).catch(error =>{
           console.log("error")
        })

}

app.post('/checkin',function(req,res){

    var phone = req.body.mobilenumber;
    var table = req.body.table;

    var requestedtime;
    Reservation.find({'mobilenumber':phone,Status:{'$ne':'Finished'}}).count().then(result =>{
        console.log(" result is " + result);
        //console.log("result is " + result + " size ");
        
        if (result) {
            Reservation.find({'mobilenumber':phone,Status:{'$ne':'Finished'}}).then(result =>{
        requestedtime = new Date(result[0].requestedtime);
        console.log("requested time is " +requestedtime);
        console.log("current time is " +new Date().getTime());
        var waiting=  Math.round(((requestedtime.getTime() - new Date().getTime())/3600000)*-60)

    console.log("waiting is " +waiting);
    Table.find({"table":table}).then(result => {

        if (result.length == 0) {

            res.status(500).json({error:" Wrong table"});
        }
        else {

         if (result[0].waiting > 0 && (result[0].status == 'Checkin' || result[0].status == 'Available')) {

            Table.updateOne({'table':table},{$set:{waiting:result[0].waiting-1,status:'Reserved'}})
            .then(result =>
                {
                   
                }).catch(err =>{
                  
                     console.log('error');
                })
            
                Reservation.updateOne({'mobilenumber':phone,'Status':{'$ne':'Finished'}},{$set:{checkintime:new Date(),Status:'Checked In',waitingtime:waiting + " minutes"}})
            .then(result =>
        {
            res.status(200).json({
                message:"checkedin successfully",
            });
        }).catch(err =>{
            res.status(500).json({error:err});
        })
         }

         else if (result[0].waiting == 0 && result[0].status == 'Checkin'){

            Table.updateOne({'table':table},{$set:{status:'Reserved'}})
    .then(result =>
        {
           
        }).catch(err =>{
          
             console.log('error');
        })

        Reservation.updateOne({'mobilenumber':phone,'Status':{'$ne':'Finished'}},{$set:{checkintime:new Date(),Status:'Checked In',waitingtime:waiting+ " minutes"}})
        .then(result =>
        {
            res.status(200).json({
                message:"checkedin successfully",
            });
        }).catch(err =>{
            res.status(500).json({error:err});
        })
         
    }

    else {

        res.status(500).json({
            error:"Table is not available"});
     }
    }
    }).catch(err =>{

    })
}).catch(err =>{

})
}
else {
    res.status(500).json({
        error:"Reservation not found"});
}
}).catch(err =>{

})

});

app.get('/tables',function(req,res){

    var count = req.query.size;

    console.log(' count is ' + count);

    Table.find({

        $and:[
            {"size":{$gte:count}},{"status":"Available"}
        ]
    }).then(result =>{

         res.status(200).json(result);
    }).catch(err =>{
          
        res.status(500).json({err:error});
        })

});

app.post('/checkout',function(req,res){

    var mobile = req.body.mobilenumber;
    var table = req.body.table;
    var status;
    var fmobile;

    Reservation.find({Table:table,'Status':{'$ne':'Finished'}}).sort({requestedtime:1}).then(result=>{

        fmobile = result[0].mobilenumber;
    })

    Reservation.find({"mobilenumber":mobile,'Status':{$ne:'Finished'}}).then(result => {

        

        if(result.length > 0){

            status = result[0].Status;
        if (result[0].checkintime == null)
        {

            var waitinngc = Math.round(((new Date().getTime() - result[0].requestedtime)/3600000)*60);
            Reservation.updateOne({'mobilenumber':mobile,'Status':{'$ne':'Finished'}},{$set:{checkouttime:new Date(), Status:'Finished',waitingtime:waitinngc + " minutes"}})
        .then(result =>{
    
            
        }).catch(err =>{
            res.status(500).json({error:err});
        })
        }
        else {

            Reservation.updateOne({'mobilenumber':mobile,'Status':{'$ne':'Finished'}},{$set:{checkouttime:new Date(), Status:'Finished'}})
        .then(result =>{
    
            
        }).catch(err =>{
            res.status(500).json({error:err});
        })
        }
        

        var ftime=0;
       // var add =0;
        var available;

        if (result[0].checkintime == null && result[0].waitingtime == null){

            ftime = Math.round(90 - (((new Date().getTime() - result[0].requestedtime)/3600000)*60));
        }
        else if (result[0].checkintime == null && result[0].waitingtime != null){

            ftime = 75;
        }
        else {
        ftime =  Math.round(75 - ((new Date().getTime() - result[0].checkintime)/3600000)*60);
     }
       console.log("ftime is " + ftime);

            Table.find({'table':table}).then( result=>{

                console.log(" Table is " + result);

                available = result[0].availableTime - 1000 * 60 * (ftime);

                if (result[0].waiting > 0 && status == 'Checked In' || (result[0].status != 'Reserved' && status !='Checked In' && fmobile==mobile && result[0].waiting !=1)){
                
                    console.log("check in is " + 'First Checked In')
                
                    Table.updateOne({'table':table},{$set:{status:'Checkin',availableTime:available,waiting:result[0].waiting-1}})
                .then(result =>{
            
                      alertUser(table);
                      thanksUser(mobile);
                      res.status(200).json({
                        message:"checkout successfull",
                    });
                }).catch(err =>{
            
                })
            } else if(result[0].waiting == 1 && status != 'Checked In'){

                console.log("check in is " + 'last Checked In')
                Table.updateOne({'table':table},{$set:{waiting:result[0].waiting-1,status:'Available',availableTime:null}})
                .then(result =>{
            
                    thanksUser(mobile);
                    res.status(200).json({
                        message:"checkout successfull",
                    });
                }).catch(err =>{
            
                })
            }
            else if(result[0].waiting > 0 && status != 'Checked In'){

                console.log("check in is " + 'Checked In')
                Table.updateOne({'table':table},{$set:{waiting:result[0].waiting-1,availableTime:available}})
                .then(result =>{
            
                    thanksUser(mobile);
                    res.status(200).json({
                        message:"checkout successfull",
                    });
                }).catch(err =>{
            
                })
            }
            else {

                Table.updateOne({'table':table},{$set:{status:'Available',availableTime:null}})
                .then(result =>{
            
                    thanksUser(mobile);
                    res.status(200).json({
                        message:"checkout successfull",
                    });
                }).catch(err =>{
            
                })
            }
            })

    }

    else {

        res.status(500).json({error:"No valid reservation found"});
    }
})
    

   
})

app.get('/reservations',function(req,res){

    Reservation.find({Status:{'$ne':'Finished'}}).sort({requestedtime:1}).then(result =>{

        if (result.length == 0){

            res.status(500).json({error: 'No Current Reservations'})
        }
        else {
            res.status(200).json({result:result})
        }

    }).catch(err =>{

    })
})

app.get('/allreservations',function(req,res){

    Reservation.find().sort({requestedtime:-1}).then(result=>{

        res.status(200).json({result:result})
        
    })
})

function alertUser(tableNumber){

    Reservation.find({Table:tableNumber,'Status':{'$ne':'Finished'}}).sort({waitingtime:1}).then(result =>{

        console.log(" check in is " + result);

        client.messages
                .create({
                 body: 'Table is available',
                 from: '+17046650085',
                 to: result[0].mobilenumber
                })
            .then(message => console.log(message.sid))
            .done();

    }).catch(err =>{

    })
}

function thanksUser(mobile){

    client.messages
                .create({
                 body: 'Thanks for visiting us !!! See you soon',
                 from: '+17046650085',
                 to: mobile
                })
            .then(message => console.log(message.sid))
            .done();
    
}
app.listen(4000, () => {
    console.log("server is running at 4000");
});


 


