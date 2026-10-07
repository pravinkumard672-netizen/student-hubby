/* CampusVault – shared logic. Papers are stored in the browser (IndexedDB). */
(function () {
  "use strict";

  /* ---------- Class data: Major -> Degree -> Semesters / Subjects ---------- */
  var MAJORS = {
    "Computer Science": ["B.Tech", "B.Sc", "BCA", "M.Tech", "MCA"],
    "Electronics": ["B.Tech", "B.Sc", "M.Tech"],
    "Mechanical": ["B.Tech", "M.Tech"],
    "Civil": ["B.Tech", "M.Tech"],
    "Commerce": ["B.Com", "M.Com", "BBA"],
    "Business": ["BBA", "MBA"],
    "Mathematics": ["B.Sc", "M.Sc"],
    "Physics": ["B.Sc", "M.Sc"],
    "Chemistry": ["B.Sc", "M.Sc"]
  };
  var SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
  var SUBJECTS = {
    "Computer Science": ["Data Structures", "Algorithms", "Operating Systems", "DBMS", "Computer Networks", "Web Technology", "Software Engineering", "Programming in C", "Java", "Python", "Other"],
    "Electronics": ["Circuit Theory", "Digital Electronics", "Signals and Systems", "Microprocessors", "VLSI", "Communication Systems", "Other"],
    "Mechanical": ["Thermodynamics", "Fluid Mechanics", "Machine Design", "Manufacturing", "Engineering Mechanics", "Other"],
    "Civil": ["Structural Analysis", "Surveying", "Concrete Technology", "Geotechnical Engineering", "Other"],
    "Commerce": ["Financial Accounting", "Cost Accounting", "Business Law", "Taxation", "Economics", "Other"],
    "Business": ["Marketing", "Finance", "Human Resources", "Operations", "Business Statistics", "Other"],
    "Mathematics": ["Calculus", "Linear Algebra", "Real Analysis", "Differential Equations", "Statistics", "Other"],
    "Physics": ["Mechanics", "Optics", "Quantum Physics", "Electromagnetism", "Thermal Physics", "Other"],
    "Chemistry": ["Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry", "Analytical Chemistry", "Other"]
  };
  var MAX_BYTES = 5 * 1024 * 1024;
  var OK_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

  /* ---------- Tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function fill(sel, items, placeholder, labelFn) {
    sel.innerHTML = "";
    var o = document.createElement("option");
    o.value = ""; o.textContent = placeholder;
    sel.appendChild(o);
    items.forEach(function (v) {
      var op = document.createElement("option");
      op.value = v; op.textContent = labelFn ? labelFn(v) : v;
      sel.appendChild(op);
    });
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function semLabel(n) { return "Semester " + n; }

  /* ---------- Supabase ---------- */
  var SUPABASE_URL = "https://sxnnonmjzeaaxtbqocar.supabase.co";
  var SUPABASE_KEY = "sb_publishable_adyyTHY6vJpynxYZqpqbuA_wzvuGZio";
  var SUPABASE_BUCKET = "papers";
  var supabaseClient = null;

  function loadSupabase() {
    if (window.supabase && window.supabase.createClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      return Promise.resolve(supabaseClient);
    }

    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = function () {
        try {
          if (!window.supabase || !window.supabase.createClient) {
            reject(new Error("Supabase library could not be loaded."));
            return;
          }
          supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
          resolve(supabaseClient);
        } catch (e) {
          reject(e);
        }
      };
      script.onerror = function () {
        reject(new Error("Could not load Supabase. Check your internet connection."));
      };
      document.head.appendChild(script);
    });
  }

  function addPaper(p) {
    return loadSupabase().then(function (sb) {
      var safeName = p.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      var path = Date.now() + "-" + Math.random().toString(36).slice(2) + "-" + safeName;

      return sb.storage.from(SUPABASE_BUCKET).upload(path, p.blob, {
        contentType: p.type,
        upsert: false
      }).then(function (uploadResult) {
        if (uploadResult.error) throw uploadResult.error;

        var row = {
          major: p.major,
          degree: p.degree,
          semester: p.semester,
          subject: p.subject,
          year: p.year,
          title: p.title,
          file_path: path,
          file_name: p.fileName,
          file_type: p.type,
          file_size: p.size
        };

        return sb.from("papers").insert(row).select().single().then(function (dbResult) {
          if (dbResult.error) throw dbResult.error;
          return dbResult.data;
        });
      });
    });
  }

  function deletePaper(id, filePath) {
    return loadSupabase().then(function (sb) {
      return sb.from("papers").delete().eq("id", id).then(function (dbResult) {
        if (dbResult.error) throw dbResult.error;

        // File deletion requires a storage DELETE policy. If none exists,
        // the database row is still deleted and the file can be removed
        // later from Supabase Storage by the project owner.
        return dbResult;
      });
    });
  }

  function allPapers() {
    return loadSupabase().then(function (sb) {
      return sb.from("papers").select("*").order("created_at", { ascending: false }).then(function (result) {
        if (result.error) throw result.error;
        return (result.data || []).map(function (p) {
          var publicResult = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(p.file_path);
          return {
            id: p.id,
            major: p.major,
            degree: p.degree,
            semester: p.semester,
            subject: p.subject,
            year: p.year,
            title: p.title,
            fileName: p.file_name,
            type: p.file_type,
            size: p.file_size,
            url: publicResult.data.publicUrl,
            added: new Date(p.created_at).getTime()
          };
        });
      });
    });
  }

  /* ---------- Cascading pickers ---------- */
  function wirePickers(opts) {
    var major = $("major"), degree = $("degree"), sem = $("semester"), subject = $("subject");
    var anyText = opts.any;
    fill(major, Object.keys(MAJORS), anyText ? "All majors" : "Select major");
    fill(degree, [], anyText ? "All degrees" : "Select degree");
    fill(sem, SEMESTERS, anyText ? "All semesters" : "Select semester", semLabel);
    if (subject) fill(subject, [], "Select subject");

    major.addEventListener("change", function () {
      var m = major.value;
      fill(degree, m ? MAJORS[m] : (anyText ? allDegrees() : []), anyText ? "All degrees" : "Select degree");
      if (subject) fill(subject, m ? SUBJECTS[m] : [], "Select subject");
      if (opts.onChange) opts.onChange();
    });
    [degree, sem].forEach(function (el) { el.addEventListener("change", function () { if (opts.onChange) opts.onChange(); }); });
    if (anyText) fill(degree, allDegrees(), "All degrees");
  }
  function allDegrees() {
    var seen = {};
    Object.keys(MAJORS).forEach(function (m) { MAJORS[m].forEach(function (d) { seen[d] = 1; }); });
    return Object.keys(seen);
  }

  /* ---------- Upload page ---------- */
  function initUpload() {
    wirePickers({ any: false });
    var form = $("uploadForm"), msg = $("msg"), btn = $("submitBtn");
    var yr = $("year");
    var thisYear = new Date().getFullYear();
    yr.max = thisYear; yr.min = 1990; yr.value = thisYear;

    function show(text, kind) { msg.textContent = text; msg.className = "msg show " + kind; }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var file = $("file").files[0];
      var major = $("major").value, degree = $("degree").value, sem = $("semester").value, subject = $("subject").value;
      var year = parseInt(yr.value, 10);
      if (!major || !degree || !sem || !subject) return show("Choose major, degree, semester and subject.", "err");
      if (!year || year < 1990 || year > thisYear) return show("Enter a valid exam year (1990–" + thisYear + ").", "err");
      if (!file) return show("Choose a file to upload.", "err");
      if (OK_TYPES.indexOf(file.type) === -1) return show("File must be a PDF, JPG, PNG or WebP.", "err");
      if (file.size > MAX_BYTES) return show("File is larger than 5 MB. Compress it and try again.", "err");

      btn.disabled = true; btn.textContent = "Uploading…";
      var title = $("title").value.trim() || (subject + " " + year);
      addPaper({
        major: major, degree: degree, semester: parseInt(sem, 10), subject: subject, year: year,
        title: title, fileName: file.name, type: file.type, size: file.size,
        blob: file
      }).then(function () {
        show("Paper uploaded to Supabase. You can find it on the Browse page.", "ok");
        form.reset(); yr.value = thisYear;
        fill($("degree"), [], "Select degree"); fill($("subject"), [], "Select subject");
      }).catch(function (err) {
        show("Upload failed: " + (err && err.message ? err.message : "unknown error"), "err");
      }).then(function () { btn.disabled = false; btn.textContent = "Upload paper"; });
    });
  }

  /* ---------- Browse page ---------- */
  var urls = [];
  function initBrowse() {
    var list = $("list"), count = $("count"), q = $("q");
    var papers = [];

    function render() {
      urls = [];
      var m = $("major").value, d = $("degree").value, s = $("semester").value, term = q.value.trim().toLowerCase();
      var rows = papers.filter(function (p) {
        if (m && p.major !== m) return false;
        if (d && p.degree !== d) return false;
        if (s && String(p.semester) !== s) return false;
        if (term && (p.subject + " " + p.year + " " + p.title).toLowerCase().indexOf(term) === -1) return false;
        return true;
      }).sort(function (a, b) { return b.added - a.added; });

      count.textContent = rows.length + (rows.length === 1 ? " paper found" : " papers found");
      if (!rows.length) {
        list.innerHTML = '<div class="empty">' + (papers.length ? "No papers match these filters." : 'No papers yet. <a href="upload.html">Upload the first one</a>.') + "</div>";
        return;
      }
      list.innerHTML = "";
      rows.forEach(function (p) {
        var url = p.url;
        var div = document.createElement("div");
        div.className = "paper";
        div.innerHTML =
          "<div><h3>" + esc(p.title) + "</h3><small>" + esc(p.major) + " · " + esc(p.degree) + " · Semester " + p.semester +
          " · " + esc(p.subject) + " · " + p.year + " · " + (p.size / 1024 < 1024 ? Math.round(p.size / 1024) + " KB" : (p.size / 1048576).toFixed(1) + " MB") + "</small></div>" +
          '<div class="actions"><a class="btn" target="_blank" rel="noopener" href="' + url + '">Open</a>' +
          '<a class="btn alt" download="' + esc(p.fileName) + '" href="' + url + '">Download</a>' +
          '</div>';
        list.appendChild(div);
      });
    }

    wirePickers({ any: true, onChange: render });
    q.addEventListener("input", render);

    function load() {
      return allPapers().then(function (rows) { papers = rows || []; render(); })
        .catch(function (err) { count.textContent = ""; list.innerHTML = '<div class="empty">' + esc(err.message) + "</div>"; });
    }
    load();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var page = document.body.getAttribute("data-page");
    if (page === "upload") initUpload();
    if (page === "browse") initBrowse();
  });
})();
