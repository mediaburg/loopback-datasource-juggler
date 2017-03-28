// Copyright IBM Corp. 2013,2015. All Rights Reserved.
// Node module: loopback-datasource-juggler
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

/* global getSchema:false */
var should = require('./init.js');
var async = require('async');
var assert = require('assert');
var bdd = require('./helpers/bdd-if');

var DataSource = require('../').DataSource;

var db = getSchema(), User, Profile, AccessToken, Post, Passport, City, Street, Building, Assembly, Part;
var isCassandraConnector = db.connector.name === 'cassandra';

describe('include', function() {
  before(setup);

  it('should fetch belongsTo relation', function(done) {
    Passport.find({include: 'owner'}, function(err, passports) {
      passports.length.should.be.ok;
      passports.forEach(function(p) {
        p.__cachedRelations.should.have.property('owner');

        // The relation should be promoted as the 'owner' property
        p.should.have.property('owner');
        // The __cachedRelations should be removed from json output
        p.toJSON().should.not.have.property('__cachedRelations');

        var owner = p.__cachedRelations.owner;
        if (!p.ownerId) {
          should.not.exist(owner);
        } else {
          should.exist(owner);
          should.equal(owner.id, p.ownerId);
        }
      });
      done();
    });
  });

  bdd.itIf(!isCassandraConnector, 'should fetch hasMany relation', function(done) {
    User.find({include: 'posts'}, function(err, users) {
      should.not.exist(err);
      should.exist(users);
      users.length.should.be.ok;
      users.forEach(function(u) {
        // The relation should be promoted as the 'owner' property
        u.should.have.property('posts');
        // The __cachedRelations should be removed from json output
        u.toJSON().should.not.have.property('__cachedRelations');

        u.__cachedRelations.should.have.property('posts');
        u.__cachedRelations.posts.forEach(function(p) {
          should.equal(p.userId, u.id);
        });
      });
      done();
    });
  });

  bdd.itIf(!isCassandraConnector, 'should not have changed the __strict flag of the model', function(done) {
    const originalStrict = User.definition.settings.strict;
    User.definition.settings.strict = true; // Change to test regression for issue #1252
    const finish = (err) => {
      // Restore original user strict property
      User.definition.settings.strict = originalStrict;
      done(err);
    };
    User.find({include: 'posts'}, function(err, users) {
      if (err) return finish(err);
      users.forEach(user => {
        user.should.have.property('__strict', true); // we changed it
      });
      finish();
    });
  });

  it('should not save in db included models, in query returned models', function(done) {
    const originalStrict = User.definition.settings.strict;
    User.definition.settings.strict = true; // Change to test regression for issue #1252
    const finish = (err) => {
      // Restore original user strict property
      User.definition.settings.strict = originalStrict;
      done(err);
    };
    User.findOne({where: {name: 'User A'}, include: 'posts'}, function(err, user) {
      if (err) return finish(err);
      if (!user) return finish(new Error('User Not found to check relation not saved'));
      user.save(function(err) { // save the returned user
        if (err) return finish(err);
        // should not store in db the posts
        var dsName = User.dataSource.name;
        if (dsName === 'memory') {
          JSON.parse(User.dataSource.adapter.cache.User[1]).should.not.have.property('posts');
          finish();
        } else if (dsName === 'mongodb') { //  Check native mongodb connector
          // get hold of native mongodb collection
          var dbCollection = User.dataSource.connector.collection(User.modelName);
          dbCollection.findOne({_id: user.id})
            .then(function(foundUser) {
              if (!foundUser) {
                finish(new Error('User not found to check posts not saved'));
              }
              foundUser.should.not.have.property('posts');
              finish();
            })
            .catch(finish);
        } else { // TODO make native checks for other connectors as well
          finish();
        }
      });
    });
  });

  bdd.itIf(!isCassandraConnector, 'should fetch Passport - Owner - Posts', function(done) {
    Passport.find({include: {owner: 'posts'}}, function(err, passports) {
      should.not.exist(err);
      should.exist(passports);
      passports.length.should.be.ok;
      passports.forEach(function(p) {
        p.__cachedRelations.should.have.property('owner');

        // The relation should be promoted as the 'owner' property
        p.should.have.property('owner');
        // The __cachedRelations should be removed from json output
        p.toJSON().should.not.have.property('__cachedRelations');

        var user = p.__cachedRelations.owner;
        if (!p.ownerId) {
          should.not.exist(user);
        } else {
          should.exist(user);
          should.equal(user.id, p.ownerId);
          user.__cachedRelations.should.have.property('posts');
          user.should.have.property('posts');
          user.toJSON().should.have.property('posts').and.be.an.Array;
          user.__cachedRelations.posts.forEach(function(pp) {
            should.equal(pp.userId, user.id);
          });
        }
      });
      done();
    });
  });

  it('should fetch Passport - Owner - empty Posts', function(done) {
    Passport.findOne({where: {number: 4}, include: {owner: 'posts'}}, function(err, passport) {
      should.not.exist(err);
      should.exist(passport);
      passport.__cachedRelations.should.have.property('owner');

      // The relation should be promoted as the 'owner' property
      passport.should.have.property('owner');
      // The __cachedRelations should be removed from json output
      passport.toJSON().should.not.have.property('__cachedRelations');

      var user = passport.__cachedRelations.owner;
      should.exist(user);
      should.equal(user.id, passport.ownerId);
      user.__cachedRelations.should.have.property('posts');
      user.should.have.property('posts');
      user.toJSON().should.have.property('posts').and.be.an.Array().with
          .length(0);
      done();
    });
  });

  // FIXME
  // IN predicates on non-primary-key columns (userId) is not yet supported
  // SELECT "title","id","userId" FROM "Post" WHERE "userId" IN (?,?,?) ALLOW FILTERING
  bdd.itIf(!isCassandraConnector, 'should fetch Passport - Owner - Posts - alternate syntax', function(done) {
    Passport.find({include: {owner: {relation: 'posts'}}}, function(err, passports) {
      should.not.exist(err);
      should.exist(passports);
      passports.length.should.be.ok;
      var posts = passports[0].owner().posts();
      posts.should.have.length(3);
      done();
    });
  });

  // FIXME
  // IN predicates on non-primary-key columns (userId) is not yet supported
  // SELECT "title","id","userId" FROM "Post" WHERE "userId" IN (?,?,?) ALLOW FILTERING
  bdd.itIf(!isCassandraConnector, 'should fetch Passports - User - Posts - User', function(done) {
    Passport.find({
      include: {owner: {posts: 'author'}},
    }, function(err, passports) {
      should.not.exist(err);
      should.exist(passports);
      passports.length.should.be.ok;
      passports.forEach(function(p) {
        p.__cachedRelations.should.have.property('owner');
        var user = p.__cachedRelations.owner;
        if (!p.ownerId) {
          should.not.exist(user);
        } else {
          should.exist(user);
          should.equal(user.id, p.ownerId);
          user.__cachedRelations.should.have.property('posts');
          user.__cachedRelations.posts.forEach(function(pp) {
            pp.should.have.property('id');
            should.equal(pp.userId, user.id);
            pp.should.have.property('author');
            pp.__cachedRelations.should.have.property('author');
            var author = pp.__cachedRelations.author;
            should.equal(author.id, user.id);
          });
        }
      });
      done();
    });
  });

  // FIXME
  // IN predicates on non-primary-key columns (userId) is not yet supported
  // SELECT "title","userId" FROM "Post" WHERE "userId" IN (?,?,?) ALLOW FILTERING
  bdd.itIf(!isCassandraConnector, 'should fetch Passports with include scope on Posts', function(done) {
    Passport.find({
      include: {owner: {relation: 'posts', scope: {
        fields: ['title'], include: ['author'],
        order: 'title DESC',
      }}},
    }, function(err, passports) {
      should.not.exist(err);
      should.exist(passports);
      passports.length.should.equal(4);

      var passport = passports[0];
      passport.number.should.equal('1');
      passport.owner().name.should.equal('User A');
      var owner = passport.owner().toObject();

      var posts = passport.owner().posts();
      posts.should.be.an.array;
      posts.should.have.length(3);

      posts[0].title.should.equal('Post C');
      posts[0].should.have.property('id', undefined); // omitted
      posts[0].author().should.be.instanceOf(User);
      posts[0].author().name.should.equal('User A');

      posts[1].title.should.equal('Post B');
      posts[1].author().name.should.equal('User A');

      posts[2].title.should.equal('Post A');
      posts[2].author().name.should.equal('User A');

      done();
    });
  });

  // FIXME
  bdd.itIf(!isCassandraConnector, 'should support limit', function(done) {
    Passport.find({
      include: {
        owner: {
          relation: 'posts', scope: {
            fields: ['title'], include: ['author'],
            order: 'title DESC',
            limit: 1,
          },
        },
      },
      limit: 2,
    }, function(err, passports) {
      if (err) return done(err);

      passports.length.should.equal(2);
      var posts1 = passports[0].toJSON().owner.posts;
      posts1.length.should.equal(1);
      if (isCassandraConnector) {
        posts1[0].title.should.startWith('Post');
      } else {
        posts1[0].title.should.equal('Post C');
      }
      var posts2 = passports[1].toJSON().owner.posts;
      posts2.length.should.equal(1);
      if (isCassandraConnector) {
        posts2[0].title.should.startWith('Post');
      } else {
        posts2[0].title.should.equal('Post D');
      }

      done();
    });
  });

  describe('inq limit', function() {
    before(function() {
      Passport.dataSource.settings.inqLimit = 2;
    });

    after(function() {
      delete Passport.dataSource.settings.inqLimit;
    });

    // FIXME
    // IN predicates on non-primary-key columns (userId) is not yet supported
    // SELECT "title","userId" FROM "Post" WHERE "userId" IN (?,?) ALLOW FILTERING
    bdd.itIf(!isCassandraConnector, 'should support include by pagination', function(done) {
      // `pagination` in this case is inside the implementation and set by
      // `inqLimit = 2` in the before block. This will need to be reworked once
      // we decouple `findWithForeignKeysByPage`.
      //
      // --superkhau
      Passport.find({
        include: {
          owner: {
            relation: 'posts',
            scope: {
              fields: ['title'], include: ['author'],
              order: 'title ASC',
            },
          },
        },
      }, function(err, passports) {
        console.log('========= 1 :', err, passports);
        if (err) return done(err);

        passports.length.should.equal(4);
        var posts1 = passports[0].toJSON().owner.posts;
        posts1.length.should.equal(3);
        posts1[0].title.should.equal('Post A');
        var posts2 = passports[1].toJSON().owner.posts;
        posts2.length.should.equal(1);
        posts2[0].title.should.equal('Post D');

        done();
      });
    });
  });

  describe('findWithForeignKeysByPage', function() {
    context('filter', function() {
      it('works when using a `where` with a foreign key', function(done) {
        User.findOne({
          include: {
            relation: 'passports',
          },
        }, function(err, user) {
          if (err) return done(err);
          should.not.exist(err);
          var passport = user.passports()[0];
          if (isCassandraConnector) {
            if (passport) {
              should.exist(passport.id);
              should.exist(passport.ownerId);
              should.exist(passport.number);
            }
          } else {
            // passport might be undefined (timing issue)
            // eql instead of equal because mongo uses object id type
            should.equal(passport.id, createdPassports[0].id);
            should.equal(passport.ownerId, createdPassports[0].ownerId);
            passport.number.should.eql(createdPassports[0].number);
          }
          done();
        });
      });

      // CASS FIXME TSETO
      // userId cannot be restricted by more than one relation if it includes an Equal
      // SELECT "title","id","userId" FROM "Post" WHERE ("id"=?) AND ("userId"=?) AND ("title"=?) AND "userId" IN (?) ALLOW FILTERING'
      bdd.itIf(!isCassandraConnector, 'works when using a `where` with `and`', function(done) {
        User.findOne({
          include: {
            relation: 'posts',
            scope: {
              where: {
                and: [
                  {id: createdPosts[0].id},
                  {userId: createdPosts[0].userId},
                  {title: 'Post A'},
                ],
              },
            },
          },
        }, function(err, user) {
          if (err) return done(err);
          should.not.exist(err);
          var ix = isCassandraConnector ? createdPassports.length - 1 : 0;
          user.name.should.equal('User A');
          user.age.should.equal(21);
          should.equal(user.id, createdUsers[ix].id);
          var posts = user.posts();
          posts.length.should.equal(1);
          var post = posts[0];
          post.title.should.equal('Post A');
          // eql instead of equal because mongo uses object id type
          should.equal(post.userId, createdPosts[ix].userId);
          should.equal(post.id, createdPosts[ix].id);

          done();
        });
      });

      // CASS FIXME TSETO
      // user.posts().length.should.equal(0)
      bdd.itIf(!isCassandraConnector, 'works when using `where` with `limit`', function(done) {
        User.findOne({
          include: {
            relation: 'posts',
            scope: {
              limit: 1,
            },
          },
        }, function(err, user) {
          if (err) return done(err);

          user.posts().length.should.equal(1);

          done();
        });
      });

      // skip not supported by Cass connector
      bdd.itIf(!isCassandraConnector, 'works when using `where` with `skip`', function(done) {
        User.findOne({
          include: {
            relation: 'posts',
            scope: {
              skip: 1,
            },
          },
        }, function(err, user) {
          if (err) return done(err);

          var ids = user.posts().map(function(p) { return p.id; });
          should.equal(ids[0], createdPosts[1].id);
          should.equal(ids[1], createdPosts[2].id);

          done();
        });
      });

      // offset not supported by Cass connector
      bdd.itIf(!isCassandraConnector, 'works when using `where` with `offset`', function(done) {
        User.findOne({
          include: {
            relation: 'posts',
            scope: {
              offset: 1,
            },
          },
        }, function(err, user) {
          if (err) return done(err);

          var ids = user.posts().map(function(p) { return p.id; });
          should.equal(ids[0], createdPosts[1].id);
          should.equal(ids[1], createdPosts[2].id);

          done();
        });
      });

      // offset and skip not supported by Cass connector
      bdd.itIf(!isCassandraConnector, 'works when using `where` without `limit`, `skip` or `offset`',
      function(done) {
        User.findOne({include: {relation: 'posts'}}, function(err, user) {
          if (err) return done(err);

          var posts = user.posts();
          var ids = posts.map(function(p) { return p.id; });
          should.equal(ids[0], createdPosts[0].id);
          should.equal(ids[1], createdPosts[1].id);
          should.equal(ids[2], createdPosts[2].id);

          done();
        });
      });
    });

    // context('pagination', function() {
    //   it('works with the default page size (0) and `inqlimit` is exceeded',
    //   function(done) {
    //     // inqLimit modifies page size in the impl (there is no way to modify
    //     // page size directly as it is hardcoded (once we decouple the func,
    //     // we can use ctor injection to pass in whatever page size we want).
    //     //
    //     // --superkhau
    //     Post.dataSource.settings.inqLimit = 2;

    //     User.find({include: {relation: 'posts'}}, function(err, users) {
    //       if (err) return done(err);

    //       users.length.should.equal(5);

    //       delete Post.dataSource.settings.inqLimit;

    //       done();
    //     });
    //   });

    //   it('works when page size is set to 0', function(done) {
    //     Post.dataSource.settings.inqLimit = 0;

    //     User.find({include: {relation: 'posts'}}, function(err, users) {
    //       if (err) return done(err);

    //       users.length.should.equal(5);

    //       delete Post.dataSource.settings.inqLimit;

    //       done();
    //     });
    //   });
    // });

    context('relations', function() {
      // WARNING
      // The code paths for in this suite of tests were verified manually due to
      // the tight coupling of the `findWithForeignKeys` in `include.js`.
      //
      // TODO
      // Decouple the utility functions into their own modules and export each
      // function individually to allow for unit testing via DI.
      //
      // --superkhau

      it('works when hasOne is called', function(done) {
        User.findOne({include: {relation: 'profile'}}, function(err, user) {
          if (err) return done(err);

          if (isCassandraConnector) {
            // order is not guaranteed
            if (user) {
              user.name.should.startWith('User');
              user.age.should.be.above(20);
            }
          } else {
            user.name.should.equal('User A');
            user.age.should.equal(21);
            // eql instead of equal because mongo uses object id type
            user.id.should.eql(createdUsers[0].id);
            var profile = user.profile();
            profile.profileName.should.equal('Profile A');
            // eql instead of equal because mongo uses object id type
            profile.userId.should.eql(createdProfiles[0].userId);
            profile.id.should.eql(createdProfiles[0].id);
          }

          done();
        });
      });

      it('works when hasMany is called', function(done) {
        User.findOne({include: {relation: 'posts'}}, function(err, user) {
          if (err) return done();

          if (isCassandraConnector) {
            if (user) {
              user.name.should.startWith('User');
              user.age.should.be.above(20);
            }
          } else {
            user.name.should.equal('User A');
            user.age.should.equal(21);
            // eql instead of equal because mongo uses object id type
            should.equal(user.id, createdUsers[0].id);
            user.posts().length.should.equal(3);
          }

          done();
        });
      });

      it('works when hasManyThrough is called', function(done) {
        var Physician = db.define('Physician', {name: String});
        var Patient = db.define('Patient', {name: String});
        var Appointment = db.define('Appointment', {
          date: {
            type: Date,
            default: function() {
              return new Date();
            },
          },
        });
        var Address = db.define('Address', {name: String});

        Physician.hasMany(Patient, {through: Appointment});
        Patient.hasMany(Physician, {through: Appointment});
        Patient.belongsTo(Address);
        Appointment.belongsTo(Patient);
        Appointment.belongsTo(Physician);

        db.automigrate(['Physician', 'Patient', 'Appointment', 'Address'],
          function() {
            Physician.create(function(err, physician) {
              physician.patients.create({name: 'a'}, function(err, patient) {
                Address.create({name: 'z'}, function(err, address) {
                  patient.address(address);
                  patient.save(function() {
                    physician.patients({include: 'address'},
                        function(err, patients) {
                          if (err) return done(err);

                          patients.should.have.length(1);
                          var p = patients[0];
                          p.name.should.equal('a');
                          should.equal(p.addressId.toString(), patient.addressId.toString());
                          should.equal(p.address().id, address.id);
                          p.address().name.should.equal('z');

                          done();
                        });
                  });
                });
              });
            });
          });
      });

      bdd.itIf(!isCassandraConnector, 'works when belongsTo is called', function(done) {
        Profile.findOne({include: 'user'}, function(err, profile) {
          if (err) return done(err);
          var user;

          if (isCassandraConnector) {
            profile.profileName.should.startWith('Profile');
            should.exist(profile.userId);
            should.exist(profile.id);
            user = profile.user();
            user.name.should.startWith('User');
            user.age.should.be.above(20);
          } else {
            profile.profileName.should.equal('Profile A');
            should.equal(profile.userId, createdProfiles[0].userId);
            should.equal(profile.id, createdProfiles[0].id);
            user = profile.user();
            user.name.should.equal('User A');
            user.age.should.equal(21);
            should.equal(user.id, createdUsers[0].id);
          }

          done();
        });
      });
    });
  });

  it('should fetch Users with include scope on Posts - belongsTo',
    function(done) {
      Post.find({include: {relation: 'author', scope: {fields: ['name']}}},
        function(err, posts) {
          should.not.exist(err);
          should.exist(posts);
          posts.length.should.be.above(0);
          if (!isCassandraConnector) {
            posts.length.should.equal(5);

            var author = posts[0].author();
            author.name.should.equal('User A');
            author.should.have.property('id');
            author.should.have.property('age', undefined);
          }

          done();
        });
    });

  // FIXME
  // IN predicates on non-primary-key columns (ownerId) is not yet supported
  // SELECT "title","id","userId" FROM "Post" WHERE "userId" IN (?,?,?,?,?) ALLOW FILTERING
  bdd.itIf(!isCassandraConnector, 'should fetch Users with include scope on Posts - hasMany', function(done) {
    User.find({
      include: {relation: 'posts', scope: {
        order: 'title DESC',
      }},
    }, function(err, users) {
      should.not.exist(err);
      should.exist(users);
      users.length.should.equal(5);

      users[0].name.should.equal('User A');
      users[1].name.should.equal('User B');

      var posts = users[0].posts();
      posts.should.be.an.array;
      posts.should.have.length(3);

      posts[0].title.should.equal('Post C');
      posts[1].title.should.equal('Post B');
      posts[2].title.should.equal('Post A');

      posts = users[1].posts();
      posts.should.be.an.array;
      posts.should.have.length(1);
      posts[0].title.should.equal('Post D');

      done();
    });
  });

  // FIXME
  // IN predicates on non-primary-key columns (ownerId) is not yet supported
  // SELECT "number","id","ownerId" FROM "Passport" WHERE "number"=? AND "ownerId" IN (?,?,?,?,?) ALLOW FILTERING
  bdd.itIf(!isCassandraConnector, 'should fetch Users with include scope on Passports - hasMany',
    function(done) {
      User.find({
        include: {relation: 'passports', scope: {
          where: {number: '2'},
        }},
      }, function(err, users) {
        should.not.exist(err);
        should.exist(users);
        users.length.should.equal(5);

        users[0].name.should.equal('User A');
        users[0].passports().should.be.empty;

        users[1].name.should.equal('User B');
        var passports = users[1].passports();
        passports[0].number.should.equal('2');

        done();
      });
    });

  // FIXME
  // IN predicates on non-primary-key columns (userId) is not yet supported
  // SELECT "title","id","userId" FROM "Post" WHERE "userId" IN (?,?,?,?,?) ALLOW FILTERING
  bdd.itIf(!isCassandraConnector, 'should fetch User - Posts AND Passports', function(done) {
    User.find({include: ['posts', 'passports']}, function(err, users) {
      should.not.exist(err);
      should.exist(users);
      users.length.should.be.ok;
      users.forEach(function(user) {
        // The relation should be promoted as the 'owner' property
        user.should.have.property('posts');
        user.should.have.property('passports');

        var userObj = user.toJSON();
        userObj.should.have.property('posts');
        userObj.should.have.property('passports');
        userObj.posts.should.be.an.instanceOf(Array);
        userObj.passports.should.be.an.instanceOf(Array);

        // The __cachedRelations should be removed from json output
        userObj.should.not.have.property('__cachedRelations');

        user.__cachedRelations.should.have.property('posts');
        user.__cachedRelations.should.have.property('passports');
        user.__cachedRelations.posts.forEach(function(p) {
          should.equal(p.userId, user.id);
        });
        user.__cachedRelations.passports.forEach(function(p) {
          should.equal(p.ownerId, user.id);
        });
      });
      done();
    });
  });

  // FIXME
  // IN predicates on non-primary-key columns (userId) is not yet supported
  // SELECT "title","id","userId" FROM "Post" WHERE "title"=? AND "userId" IN (?,?,?,?,?) ALLOW FILTERING
  bdd.itIf(!isCassandraConnector, 'should fetch User - Posts AND Passports in relation syntax',
    function(done) {
      User.find({include: [
        {relation: 'posts', scope: {
          where: {title: 'Post A'},
        }},
        'passports',
      ]}, function(err, users) {
        should.not.exist(err);
        should.exist(users);
        users.length.should.be.ok;
        users.forEach(function(user) {
          // The relation should be promoted as the 'owner' property
          user.should.have.property('posts');
          user.should.have.property('passports');

          var userObj = user.toJSON();
          userObj.should.have.property('posts');
          userObj.should.have.property('passports');
          userObj.posts.should.be.an.instanceOf(Array);
          userObj.passports.should.be.an.instanceOf(Array);

          // The __cachedRelations should be removed from json output
          userObj.should.not.have.property('__cachedRelations');

          user.__cachedRelations.should.have.property('posts');
          user.__cachedRelations.should.have.property('passports');
          user.__cachedRelations.posts.forEach(function(p) {
            should.equal(p.userId, user.id);
            console.log('============= 2 :', p.title);
            p.title.should.be.equal('Post A');
          });
          user.__cachedRelations.passports.forEach(function(pp) {
            should.equal(pp.ownerId, user.id);
          });
        });
        done();
      });
    });

  it('should not fetch User - AccessTokens', function(done) {
    User.find({include: ['accesstokens']}, function(err, users) {
      should.not.exist(err);
      should.exist(users);
      users.length.should.be.ok;
      users.forEach(function(user) {
        var userObj = user.toJSON();
        userObj.should.not.have.property('accesstokens');
      });
      done();
    });
  });

  it('should support hasAndBelongsToMany', function(done) {
    Assembly.create({name: 'car'}, function(err, assembly) {
      Part.create({partNumber: 'engine'}, function(err, part) {
        assembly.parts.add(part, function(err, data) {
          assembly.parts(function(err, parts) {
            should.not.exist(err);
            should.exists(parts);
            parts.length.should.equal(1);
            parts[0].partNumber.should.equal('engine');

            // Create a part
            assembly.parts.create({partNumber: 'door'}, function(err, part4) {
              Assembly.find({include: 'parts'}, function(err, assemblies) {
                assemblies.length.should.equal(1);
                assemblies[0].parts().length.should.equal(2);
                done();
              });
            });
          });
        });
      });
    });
  });

  // FIXME
  // IN predicates on non-primary-key columns (userId) is not yet supported
  // SELECT "profileName","id","userId" FROM "Profile" WHERE "userId" IN (?,?,?,?,?) ALLOW FILTERING
  bdd.itIf(!isCassandraConnector, 'should fetch User - Profile (HasOne)', function(done) {
    User.find({include: ['profile']}, function(err, users) {
      should.not.exist(err);
      should.exist(users);
      users.length.should.be.ok;
      var usersWithProfile = 0;
      users.forEach(function(user) {
        // The relation should be promoted as the 'owner' property
        user.should.have.property('profile');
        var userObj = user.toJSON();
        var profile = user.profile();
        if (profile) {
          profile.should.be.an.instanceOf(Profile);
          usersWithProfile++;
        } else {
          (profile === null).should.be.true;
        }
        // The __cachedRelations should be removed from json output
        userObj.should.not.have.property('__cachedRelations');
        user.__cachedRelations.should.have.property('profile');
        if (user.__cachedRelations.profile) {
          should.equal(user.__cachedRelations.profile.userId, user.id);
          usersWithProfile++;
        }
      });
      usersWithProfile.should.equal(2 * 2);
      done();
    });
  });

  // Not implemented correctly, see: loopback-datasource-juggler/issues/166
  // fixed by DB optimization
  // it('should support include scope on hasAndBelongsToMany', function(done) {
  //   Assembly.find({include: {relation: 'parts', scope: {
  //     where: {partNumber: 'engine'},
  //   }}}, function(err, assemblies) {
  //     assemblies.length.should.equal(1);
  //     var parts = assemblies[0].parts();
  //     parts.should.have.length(1);
  //     parts[0].partNumber.should.equal('engine');
  //     done();
  //   });
  // });

  // FIXME
  // Error: IN predicates on non-primary-key columns (userId) is not yet supported
  //
  bdd.itIf(!isCassandraConnector, 'should save related items separately', function(done) {
    User.find({
      include: 'posts',
    })
      .then(function(users) {
        var posts = users[0].posts();
        posts.should.have.length(3);
        return users[0].save();
      })
      .then(function(updatedUser) {
        return User.findById(updatedUser.id, {
          include: 'posts',
        });
      })
      .then(function(user) {
        var posts = user.posts();
        posts.should.have.length(3);
      })
      .then(done)
      .catch(done);
  });

  describe('performance', function() {
    var all;
    beforeEach(function() {
      this.called = 0;
      var self = this;
      all = db.connector.all;
      db.connector.all = function(model, filter, options, cb) {
        self.called++;
        return all.apply(db.connector, arguments);
      };
    });
    afterEach(function() {
      db.connector.all = all;
    });
    it('including belongsTo should make only 2 db calls', function(done) {
      var self = this;
      Passport.find({include: 'owner'}, function(err, passports) {
        passports.length.should.be.ok;
        passports.forEach(function(p) {
          p.__cachedRelations.should.have.property('owner');
          // The relation should be promoted as the 'owner' property
          p.should.have.property('owner');
          // The __cachedRelations should be removed from json output
          p.toJSON().should.not.have.property('__cachedRelations');
          var owner = p.__cachedRelations.owner;
          if (!p.ownerId) {
            should.not.exist(owner);
          } else {
            should.exist(owner);
            should.equal(owner.id, p.ownerId);
          }
        });
        self.called.should.eql(2);
        done();
      });
    });

    // FIXME
    //  'SELECT "id","assemblyId","partId" FROM "AssemblyPart" WHERE "assemblyId" IN (?,?,?) ALLOW FILTERING
    // IN predicates on non-primary-key columns (assemblyId) is not yet supported'
    bdd.itIf(!isCassandraConnector, 'including hasManyThrough should make only 3 db calls', function(done) {
      var self = this;
      Assembly.create([{name: 'sedan'}, {name: 'hatchback'},
          {name: 'SUV'}],
        function(err, assemblies) {
          Part.create([{partNumber: 'engine'}, {partNumber: 'bootspace'},
              {partNumber: 'silencer'}],
            function(err, parts) {
              async.each(parts, function(part, next) {
                async.each(assemblies, function(assembly, next) {
                  if (assembly.name === 'SUV') {
                    return next();
                  }
                  if (assembly.name === 'hatchback' &&
                    part.partNumber === 'bootspace') {
                    return next();
                  }
                  assembly.parts.add(part, function(err, data) {
                    next();
                  });
                }, next);
              }, function(err) {
                self.called = 0;
                Assembly.find({
                  where: {
                    name: {
                      inq: ['sedan', 'hatchback', 'SUV'],
                    },
                  },
                  include: 'parts',
                }, function(err, result) {
                  console.log('================= FIXME:', err, result);
                  should.not.exist(err);
                  should.exists(result);
                  result.length.should.equal(3);
                  // Please note the order of assemblies is random
                  var assemblies = {};
                  result.forEach(function(r) {
                    assemblies[r.name] = r;
                  });
                  // sedan
                  assemblies.sedan.parts().should.have.length(3);
                  // hatchback
                  assemblies.hatchback.parts().should.have.length(2);
                  // SUV
                  assemblies.SUV.parts().should.have.length(0);
                  self.called.should.eql(3);
                  done();
                });
              });
            });
        });
    });

    // FIXME
    // SELECT "title","id","userId" FROM "Post" WHERE "userId" IN (?,?,?,?,?) ALLOW FILTERING'
    // IN predicates on non-primary-key columns (userId) is not yet supporte
    bdd.itIf(!isCassandraConnector, 'including hasMany should make only 2 db calls', function(done) {
      var self = this;
      User.find({include: ['posts', 'passports']}, function(err, users) {
        should.not.exist(err);
        should.exist(users);
        users.length.should.be.ok;
        users.forEach(function(user) {
          // The relation should be promoted as the 'owner' property
          user.should.have.property('posts');
          user.should.have.property('passports');

          var userObj = user.toJSON();
          userObj.should.have.property('posts');
          userObj.should.have.property('passports');
          userObj.posts.should.be.an.instanceOf(Array);
          userObj.passports.should.be.an.instanceOf(Array);

          // The __cachedRelations should be removed from json output
          userObj.should.not.have.property('__cachedRelations');

          user.__cachedRelations.should.have.property('posts');
          user.__cachedRelations.should.have.property('passports');
          user.__cachedRelations.posts.forEach(function(p) {
            should.equal(p.userId, user.id);
          });
          user.__cachedRelations.passports.forEach(function(pp) {
            should.equal(pp.ownerId, user.id);
          });
        });
        self.called.should.eql(3);
        done();
      });
    });

    // FIXME
    // SELECT "title","id","userId" FROM "Post" WHERE "userId" IN (?,?,?,?,?) ALLOW FILTERING'
    // IN predicates on non-primary-key columns (userId) is not yet supporte
    bdd.itIf(!isCassandraConnector, 'should not make n+1 db calls in relation syntax',
      function(done) {
        var self = this;
        User.find({include: [{relation: 'posts', scope: {
          where: {title: 'Post A'},
        }}, 'passports']}, function(err, users) {
          should.not.exist(err);
          should.exist(users);
          users.length.should.be.ok;
          users.forEach(function(user) {
            // The relation should be promoted as the 'owner' property
            user.should.have.property('posts');
            user.should.have.property('passports');

            var userObj = user.toJSON();
            userObj.should.have.property('posts');
            userObj.should.have.property('passports');
            userObj.posts.should.be.an.instanceOf(Array);
            userObj.passports.should.be.an.instanceOf(Array);

            // The __cachedRelations should be removed from json output
            userObj.should.not.have.property('__cachedRelations');

            user.__cachedRelations.should.have.property('posts');
            user.__cachedRelations.should.have.property('passports');
            user.__cachedRelations.posts.forEach(function(p) {
              should.equal(p.userId, user.id);
              p.title.should.be.equal('Post A');
            });
            user.__cachedRelations.passports.forEach(function(pp) {
              should.equal(pp.ownerId, user.id);
            });
          });
          self.called.should.eql(3);
          done();
        });
      });
  });

  it('should support disableInclude for hasAndBelongsToMany', function() {
    var Patient = db.define('Patient', {name: String});
    var Doctor = db.define('Doctor', {name: String});
    var DoctorPatient = db.define('DoctorPatient');
    Doctor.hasAndBelongsToMany('patients', {
      model: 'Patient',
      options: {disableInclude: true},
    });

    var doctor;
    return db.automigrate(['Patient', 'Doctor', 'DoctorPatient']).then(function() {
      return Doctor.create({name: 'Who'});
    }).then(function(inst) {
      doctor = inst;
      return doctor.patients.create({name: 'Lazarus'});
    }).then(function() {
      return Doctor.find({include: ['patients']});
    }).then(function(list) {
      list.should.have.length(1);
      list[0].toJSON().should.not.have.property('patients');
    });
  });
});

var createdUsers = [];
var createdPassports = [];
var createdProfiles = [];
var createdPosts = [];
function setup(done) {
  db = getSchema();
  City = db.define('City');
  Street = db.define('Street');
  Building = db.define('Building');
  User = db.define('User', {
    name: String,
    age: Number,
  });
  Profile = db.define('Profile', {
    profileName: String,
  });
  AccessToken = db.define('AccessToken', {
    token: String,
  });
  Passport = db.define('Passport', {
    number: String,
  });
  Post = db.define('Post', {
    title: String,
  });

  Passport.belongsTo('owner', {model: User});
  User.hasMany('passports', {foreignKey: 'ownerId'});
  User.hasMany('posts', {foreignKey: 'userId'});
  User.hasMany('accesstokens', {
    foreignKey: 'userId',
    options: {disableInclude: true},
  });
  Profile.belongsTo('user', {model: User});
  User.hasOne('profile', {foreignKey: 'userId'});
  Post.belongsTo('author', {model: User, foreignKey: 'userId'});

  Assembly = db.define('Assembly', {
    name: isCassandraConnector ? {type: String, id: true} : String,
  });

  Part = db.define('Part', {
    partNumber: isCassandraConnector ? {type: String, id: true} : String,
  });

  Assembly.hasAndBelongsToMany(Part);
  Part.hasAndBelongsToMany(Assembly);

  db.automigrate(function() {
    createUsers();
    function createUsers() {
      clearAndCreate(
        User,
        [
          {name: 'User A', age: 21},
          {name: 'User B', age: 22},
          {name: 'User C', age: 23},
          {name: 'User D', age: 24},
          {name: 'User E', age: 25},
        ],
        function(items) {
          createdUsers = items;
          createPassports();
          createAccessTokens();
        }
      );
    }

    function createAccessTokens() {
      clearAndCreate(
        AccessToken,
        [
          {token: '1', userId: createdUsers[0].id},
          {token: '2', userId: createdUsers[1].id},
        ],
        function(items) {}
      );
    }

    function createPassports() {
      clearAndCreate(
        Passport,
        [
          {number: '1', ownerId: createdUsers[0].id},
          {number: '2', ownerId: createdUsers[1].id},
          {number: '3'},
          {number: '4', ownerId: createdUsers[2].id},
        ],
        function(items) {
          createdPassports = items;
          createPosts();
        }
      );
    }

    function createProfiles() {
      clearAndCreate(
        Profile,
        [
          {profileName: 'Profile A', userId: createdUsers[0].id},
          {profileName: 'Profile B', userId: createdUsers[1].id},
          {profileName: 'Profile Z'},
        ],
        function(items) {
          createdProfiles = items;
          done();
        }
      );
    }

    function createPosts() {
      clearAndCreate(
        Post,
        [
          {title: 'Post A', userId: createdUsers[0].id},
          {title: 'Post B', userId: createdUsers[0].id},
          {title: 'Post C', userId: createdUsers[0].id},
          {title: 'Post D', userId: createdUsers[1].id},
          {title: 'Post E'},
        ],
        function(items) {
          createdPosts = items;
          createProfiles();
        }
      );
    }
  });
}

function clearAndCreate(model, data, callback) {
  var createdItems = [];
  model.destroyAll(function() {
    nextItem(null, null);
  });

  var itemIndex = 0;

  function nextItem(err, lastItem) {
    if (lastItem !== null) {
      createdItems.push(lastItem);
    }
    if (itemIndex >= data.length) {
      callback(createdItems);
      return;
    }
    model.create(data[itemIndex], nextItem);
    itemIndex++;
  }
}

describe('Model instance with included relation .toJSON()', function() {
  var db, ChallengerModel, GameParticipationModel, ResultModel;

  before(function(done) {
    db = new DataSource({connector: 'memory'});
    ChallengerModel = db.createModel('Challenger',
      {
        name: String,
      },
      {
        relations: {
          gameParticipations: {
            type: 'hasMany',
            model: 'GameParticipation',
            foreignKey: '',
          },
        },
      }
    );
    GameParticipationModel = db.createModel('GameParticipation',
      {
        date: Date,
      },
      {
        relations: {
          challenger: {
            type: 'belongsTo',
            model: 'Challenger',
            foreignKey: '',
          },
          results: {
            type: 'hasMany',
            model: 'Result',
            foreignKey: '',
          },
        },
      }
    );
    ResultModel = db.createModel('Result', {
      points: Number,
    }, {
      relations: {
        gameParticipation: {
          type: 'belongsTo',
          model: 'GameParticipation',
          foreignKey: '',
        },
      },
    });

    async.waterfall([
      createChallengers,
      createGameParticipations,
      createResults],
      function(err) {
        done(err);
      });
  });

  function createChallengers(callback) {
    ChallengerModel.create([{name: 'challenger1'}, {name: 'challenger2'}], callback);
  }

  function createGameParticipations(challengers, callback) {
    GameParticipationModel.create([
      {challengerId: challengers[0].id, date: Date.now()},
      {challengerId: challengers[0].id, date: Date.now()},
    ], callback);
  }

  function createResults(gameParticipations, callback) {
    ResultModel.create([
      {gameParticipationId: gameParticipations[0].id, points: 10},
      {gameParticipationId: gameParticipations[0].id, points: 20},
    ], callback);
  }

  it('should recursively serialize objects', function(done) {
    var filter = {include: {gameParticipations: 'results'}};
    ChallengerModel.find(filter, function(err, challengers) {
      var levelOneInclusion = challengers[0].toJSON().gameParticipations[0];
      assert(levelOneInclusion.__data === undefined, '.__data of a level 1 inclusion is undefined.');

      var levelTwoInclusion = challengers[0].toJSON().gameParticipations[0].results[0];
      assert(levelTwoInclusion.__data === undefined, '__data of a level 2 inclusion is undefined.');
      done();
    });
  });
});
