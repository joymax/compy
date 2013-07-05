var util = require('util');
var path = require('path');
var spawn = require('child_process').spawn;
var compInstall = require('./component_install.js');

var folderMount = function folderMount(connect, point) {
    return connect.static(path.resolve(point));
};

var folderDir = function folderDir(connect, point){
    return connect.directory(path.resolve(point));
}

module.exports = function(grunt){
  
  //TODO: load base Gruntfile.js
  //TODO: inject grunt with hacked initConfig
  //TODO: write test
  var appJsProd = 'app' + Date.now() + ".js";
  var appCssProd = 'app' + Date.now() + ".css";
  var base = grunt.option('targetBase');
  var destination = "./dist";
  var compyGruntConfig = {
    pkg: grunt.file.readJSON(base + '/package.json'),
    dest: destination,
    // this is like component.json contents for component
    componentConfig:{
      name: '<%= pkg.name %>',
      main: '<%= pkg.compy.main %>',
      dependencies: '<%= pkg.compy.dependencies %>',
      version: '<%= pkg.version %>',
      license: '<%= pkg.license %>',
      scripts:'<%= src.js %>',
      styles: '<%= src.css %>',
      images: '<%= src.img %>',
      fonts: '<%= src.fnt %>',
      templates: '<%= src.tmpl %>'
    },
    // we-re taking all sources from here
    src:{
      js:[ '**/*.js', '**/*.coffee'],
      css:[ '**/*.css'],
      img:[ '**/*.jpg', '**/*.png', '**/*.gif', '**/*.icn'],
      fnt:[ '**/*.ttf', '**/*.eof'],
      tmpl: [ '**/*.html']
    },
    // we clean up generated source
    clean: {
      options:{force:true},
      dist:['<%= dest %>']
    },
    // we use customized component buil grunt task
    component_build:{
      app:{
        base: base,
        output:'<%= dest %>',
        config:'<%= componentConfig %>',
        configure: function(builder){
          // we overwrite dependencies to be able to hot component reload while watch
          var pkg = grunt.file.readJSON(base + '/package.json');
          if(pkg.compy.dependencies){
            builder.config.dependencies = pkg.compy.dependencies;
          }
          ignoreSources(builder.config);
        },
        plugins:['coffee', 'templates']// use plugins for html templates and coffee
      }
    },
    watch: {
      options:{
        livereload: true,
        nospawn: true
      },
      // we watch sources independantly, but that doesn't makes much sense
      js: {
        files: '<%= src.js %>',
        tasks: ['compile']
      },
      css:{
        files: '<%= src.css %>',
        tasks: ['compile']
      },
      html:{
        files: '<%= src.tmpl %>',
        tasks: ['compile']
      }
    },
    connect: {
      options: {
        port: 8080,
        base: '<%= dest %>',
        hostname: null,
      },
      server:{
        options: {
          keepalive: false,
          middleware: function(connect, options){
            return [
            require('connect-livereload')({port:35729}),
            folderMount(connect, destination),
            folderDir(connect, destination)]
          }
        }
      },
      alive:{
        options: {
          keepalive: true,
        }
      }
    },
    // preprocess used to build proper index.html
    preprocess:{
      html:{
        options:{
          context:{
            name: '<%= pkg.name %>',
            main: '<%= pkg.compy.main %>',
            description: '<%= pkg.description %>',
            title: '<%= pkg.title %>',
            appdest: 'app.js',
            appcss: 'app.css'
          }
        },
        src: __dirname + '/index.html',
        dest:'<%= dest %>/index.html'
      },
      build:{
        options:{
          context:{
            name: '<%= pkg.name %>',
            main: '<%= pkg.component.main %>',
            description: '<%= pkg.description %>',
            title: '<%= pkg.title %>',
            appdest: appJsProd,
            appcss: appCssProd
          }
        },
        src: __dirname + '/index.html',
        dest:'<%= dest %>/index.html'
      }
    },
    // concat is used to add component runner to the app
    concat: {
      dist: {
        src: ['<%= dest %>/app.js', __dirname + '/tmpl/runner.js'],
        dest: '<%= dest%>/app.js'
      }
    },
    uglify: {
      build: {
        src: ['<%= dest%>/app.js'],
        dest: '<%= dest%>/' + appJsProd
      }
    },
    cssmin: {
      build: {
        src: ['<%= dest%>/app.css'],
        dest: '<%= dest%>/' + appCssProd
      }
    }
  }
  // this dark magic allows to extend Gruntfiles
  if(grunt.file.exists(base + '/Gruntfile.js')){
    var innerGruntfile = require(base + '/Gruntfile.js');
    var oldInit = grunt.initConfig;
    var pseudoGrunt = grunt;
    pseudoGrunt.initConfig = initConfig;
    function initConfig(configObject){
      for(var key in configObject){
        compyGruntConfig[key] = configObject[key];
      }
      oldInit.call(this, compyGruntConfig);
    }
    innerGruntfile(pseudoGrunt);

    var oldReg = grunt.registerTask
    grunt.registerTask = function(){
      if(grunt.task._tasks[arguments[0]]) return;
      oldReg.apply(this, arguments);
    }
  }else{
    grunt.initConfig(compyGruntConfig); 
  }
  function ignoreSources(config){
    ['images','fonts','scripts','styles','templates'].forEach(function(asset){
      var remap = [];
      if(!config[asset]) return;
      config[asset].forEach(function(filepath){
        var relPath = path.relative(base, filepath);
        if(/^(components|dist|node_modules)\//.test(relPath)) return;
        remap.push(relPath);
      })
      config[asset] = remap;
    })
  }
  
  grunt.loadTasks(__dirname + '/node_modules/grunt-component-build/tasks');
  grunt.loadTasks(__dirname + '/node_modules/grunt-contrib-connect/tasks');
  grunt.loadTasks(__dirname + '/node_modules/grunt-contrib-watch/tasks');
  grunt.loadTasks(__dirname + '/node_modules/grunt-contrib-clean/tasks');
  grunt.loadTasks(__dirname + '/node_modules/grunt-preprocess/tasks');
  grunt.loadTasks(__dirname + '/node_modules/grunt-contrib-concat/tasks');
  grunt.loadTasks(__dirname + '/node_modules/grunt-contrib-uglify/tasks');
  grunt.loadTasks(__dirname + '/node_modules/grunt-contrib-cssmin/tasks');

  grunt.registerTask('install', 'Install component', function(){
    var config = grunt.config('componentConfig');
    ['images','fonts','scripts','styles','templates'].forEach(function(asset){
      if(config[asset]){
        config[asset] = grunt.file.expand(config[asset]);
      }
    });
    var done = this.async();
    
    ignoreSources(config);
    var args = [];
   
    var pkgCheck = process.argv.slice(-1)[0].split(':');
    if(pkgCheck.length > 1){
      pkgCheck.shift();
      args = args.concat(pkgCheck);
    }
    if(!config.dependencies) config.dependencies = {};
    compInstall(config, {args: args, out: base + "/components"}, installed);

    function installed(err, deps){
      var pkg = grunt.file.readJSON(base + '/package.json');
      pkg.compy.dependencies = deps;
      grunt.file.write(base + '/package.json', JSON.stringify(pkg, null, 2));
      done();
    }
  })

  grunt.registerTask('server', 'run server', function(arg){
    if(arg =="watch"){
      grunt.task.run('connect:server');
      return grunt.task.run('watch');
    }else{
      grunt.task.run('connect:alive');
    }
  });
  
  grunt.registerTask('compy-compile', ['clean:dist', 'component_build','concat','preprocess:html']);

  grunt.registerTask('compy-build', ['clean:dist', 'component_build','concat','preprocess:build', 'uglify', 'cssmin']);

  grunt.registerTask('compile', ['compy-compile']);

  grunt.registerTask('build', ['compy-build']);

  grunt.registerTask('default',['compile'])

}

