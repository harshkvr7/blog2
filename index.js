import express from "express";
import bodyparser from "body-parser";
import pg from "pg";
import fileupload from "express-fileupload";
import { Buffer } from "buffer"
import passport from "passport";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import env from "dotenv";

function get_date_time() {
    var dateraw = new Date();

    var day = dateraw.getDay();
    var date = dateraw.getDate();
    var year = dateraw.getFullYear();
    var month = dateraw.getMonth();

    var daystr = '';
    var monthstr = '';

    switch (day) {
        case 0:
            daystr = 'Sunday';
            break;
        case 1:
            daystr = 'Monday';
            break;
        case 2:
            daystr = 'Tuesday';
            break;
        case 3:
            daystr = 'Wednesday';
            break;
        case 4:
            daystr = 'Thursday';
            break;
        case 5:
            daystr = 'Friday';
            break;
        case 6:
            daystr = 'Saturday';
            break;
        default:
            break;
    }

    switch (month) {
        case 0:
            monthstr = 'January';
            break;
        case 1:
            monthstr = 'February';
            break;
        case 2:
            monthstr = 'March';
            break;
        case 3:
            monthstr = 'April';
            break;
        case 4:
            monthstr = 'May';
            break;
        case 5:
            monthstr = 'June';
            break;
        case 6:
            monthstr = 'July';
            break;
        case 7:
            monthstr = 'August';
            break;
        case 8:
            monthstr = 'September';
            break;
        case 9:
            monthstr = 'October';
            break;
        case 10:
            monthstr = 'November';
            break;
        case 11:
            monthstr = 'December';
            break;

        default:
            break;
    }
    var date_time = { day: daystr, month: monthstr, date: date, year: year };

    return date_time;
}

const app = express();
const port = process.env.PORT || 3000;
env.config();

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized : true,
    })
  );

app.use(express.static("public"));
app.use(bodyparser.urlencoded({ extended: true }));
app.use(fileupload());

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
})
db.connect();

app.get("/", async (req, res) => {
    if (req.isAuthenticated()) {
        const blogCountResult = await db.query("SELECT COUNT(id) as count from blogs WHERE email = $1;",[req.user.email]);
        const blogCount = blogCountResult.rows[0].count;

        var page = req.query.pg || 1;

        const offset = (page - 1) * 10;

        page = parseInt(page);

        const totalPages = Math.ceil(blogCount / 10);

        await db.query("SELECT * FROM blogs INNER JOIN users ON users.email = blogs.email WHERE blogs.email = $1 ORDER BY blogs.id DESC LIMIT 10 OFFSET $2", [req.user.email, offset], (err, result) => {
            if (err) {
                console.error("error executing query", err.stack);
            } else {
                const data = result.rows;
                res.render("./main.ejs", { blogs: data, curr: page, max: totalPages , name : req.user.name, pfp : req.user.pfp});
            }
    });
    }
    else{
        res.redirect("/login");
    }
    
});

app.get("/login", (req, res) => {
    res.render("login.ejs");
})

app.get(
    "/auth/google",
    passport.authenticate("google", {
      scope: ["profile", "email"],
    })
  );

app.get(
    "/auth/google/blogs",
    passport.authenticate("google", {
        successRedirect: "/",
        failureRedirect: "/login",
    })
);

app.get("/logout", (req, res) => {
    req.logout(function (err) {
      if (err) {
        return next(err);
      }
      res.redirect("/");
    });
  });

app.get("/addblog", (req, res) => {
    if (req.isAuthenticated()) {
        res.render("./edit.ejs");
    }
    else
    {
        res.redirect("/login");
    }
})

app.post("/addblog", async (req, res) => {
    if (req.isAuthenticated()) {
        var date_time = get_date_time();

        if (req.files) {
            const { name, data } = req.files.pic;

            const base64 = Buffer.from(data,
                "binary").toString("base64");

            await db.query("INSERT INTO blogs (content,email, date, month, img) VALUES ($1, $2, $3, $4, $5)", [req.body.text,req.user.email, date_time.date, date_time.month, base64], () => {
                res.redirect("/");
            });
        }
        else {
            await db.query("INSERT INTO blogs (content,email, date, month) VALUES ($1, $2, $3, $4)", [req.body.text,req.user.email, date_time.date, date_time.month], () => {
                res.redirect("/");
            });
        }
    }
    else{
        res.redirect("/login");
    }
})

app.get("/deleteblog", async (req, res) => {
    if (req.isAuthenticated()) {
        const blogId = req.query.id;

        await db.query("DELETE FROM blogs WHERE id = $1", [blogId], () => {
            res.redirect("/");
        });
    }
    else{
        res.redirect("/login");
    }
})

app.get("/updateblog", async (req, res) => {
    if (req.isAuthenticated()) {
        const blogId = req.query.id;

        const result = await db.query("SELECT * FROM blogs WHERE id = $1", [blogId]);
        const blog = result.rows[0];

        res.render("./edit.ejs", { blog: blog });
    }
    else
    {
        res.redirect("/login");
    }
});

app.post("/updateblog", async (req, res) => {
    if (req.isAuthenticated()) {
        const { id, content } = req.body;

        await db.query("UPDATE blogs SET content = $1 WHERE id = $2", [content, id], () => {
            res.redirect("/");
        });
    }
    else{
        res.redirect("/login");
    }
})

passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "https://blog2-q72m.onrender.com/auth/google/blogs",
        userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
      },
      async (accessToken, refreshToken, profile, cb) => {
        try {
          console.log(profile.email);
          const result = await db.query("SELECT * FROM users WHERE email = $1", [
            profile.email,
          ]);
          if (result.rows.length === 0) {
            const newUser = await db.query(
              "INSERT INTO users (email, name, pfp) VALUES ($1, $2, $3)",
              [profile.email, profile.displayName, profile.picture]
            );
            return cb(null, newUser.rows[0]);
          } else {
            return cb(null, result.rows[0]);
          }
        } catch (err) {
          return cb(err);
        }
      }
    )
  );

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});

app.listen(port, () => {
    console.log(`server running on port ${port}`);
})
