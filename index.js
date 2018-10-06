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
});

app.post('/table',function(req,res){

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

                Table.updateOne({'table':result[0].table},{$set:{'status':'Checkin', 'availableTime':new Date().getTime() + 1000 * 60 * 100,waiting:result[0].waiting + 1}})
                .then(result => {

                }).catch(err =>{
                     
                    console.log(" table error " + err);
                })

                // send message to customer that table is available and 
                // needs to checkin within 25 min.

            }
            else {
                
                 Table.find({

                    "size":{$gte:count}
                 }).sort({"waiting":1,"availableTime":1,"size":1}).then(result =>{

                    console.log(' available are '+ result);

                    var available = result[0].availableTime;
                    var waiting =  Math.round(((available.getTime() - new Date().getTime())/3600000)*60) + result[0].waiting * 75;

                    Reservation.updateOne({"mobilenumber":mobile,'Status':{'$ne':'Finished'}},{$set:{waitingtime:waiting+" minutes",Status:'Waiting for Checkin',Table:result[0].table}})
                    .then(result =>{

                    }).catch(err =>{
                        
                    })

                    Table.updateOne({table:result[0].table},{$set:{waiting:result[0].waiting + 1}})
                    .then(result =>{

                    }).catch(err => {

                    })

                    // send message to customer that table will be available
                    // in (waiting time minutes), if waiting time is less than 25 min
                    // send message that table will be available in 25 min and you need
                    // to check in with in 25 min.

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
    var requestedtime = new Date(req.body.requestedtime);
    var waiting=  Math.round(((requestedtime.getTime() - new Date().getTime())/3600000)*-60)

    Table.find({"table":table}).then(result => {

         if (result[0].waiting > 0 && (result[0].status == 'Checkin' || result[0].status == 'Available')) {

            Table.updateOne({'table':table},{$set:{availableTime: new Date().getTime() + 1000 * 60 * 75,waiting:result[0].waiting-1,status:'Reserved'}})
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

            Table.updateOne({'table':table},{$set:{availableTime: new Date().getTime() + 1000 * 60 * 75,status:'Reserved'}})
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

    Reservation.find({"mobilenumber":mobile,'Status':{$ne:'Finished'}}).then(result => {

        Reservation.updateOne({'mobilenumber':mobile,'Status':{'$ne':'Finished'}},{$set:{checkouttime:new Date(), Status:'Finished'}})
        .then(result =>{
    
            res.status(200).json({
                message:"checkout successfull",
                result:result
            });
        }).catch(err =>{
            res.status(500).json({error:err});
        })

        if (result[0].checkintime != null) {

            Table.updateOne({'table':table},{$set:{status:'Available',availableTime:null}})
        .then(result =>{
    
        }).catch(err =>{
    
        })

        }

        else {

            Table.find({'table':table}).then( result=>{

                console.log(" tables are " + result);

                Table.updateOne({'table':table},{$set:{status:'Available',availableTime:null, waiting:result[0].waitingtime-1}})
                .then(result =>{
            
                }).catch(err =>{
            
                })
            })

           
        }
    
        

    })

   
})

app.listen(4000, () => {
    console.log("server is running at 4000");
});
 


