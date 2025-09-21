document.addEventListener("DOMContentLoaded", () => {
  const BaseUrl = "http://localhost:8080";
  let chartInstance = null;

  const getDataBtn = document.getElementById("getDataBtn");
  const postDataBtn = document.getElementById("postDataBtn");
  const getUserIdInput = document.getElementById("getUserId");
  const getYearInput = document.getElementById("getYear");
  const postUserIdInput = getUserIdInput;
  const postYearInput = getYearInput;
  const getFileInput = document.getElementById("getFileInput");
  const postResults = document.getElementById("postResults");
  const tableData = document.getElementById("tableData");
  const chartCanvas = document
    .getElementById("DashboardChart")
    .getContext("2d");

  async function fetchAndRender(userId, year) {
    if (!userId || !year) return alert("Please select both User ID and Year.");
    try {
      const resp = await fetch(`${BaseUrl}/api/finances/${userId}/${year}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Unable to load data");
      }
      const payload = await resp.json();
      renderTable(payload.records);
      renderChart(payload.records, payload.year);
    } catch (err) {
      alert("Unable to load data " + err.message);
      tableData.innerHTML = '<tr><td colspan="2">No data found.</td></tr>';
    }
  }

  function renderChart(records, year) {
    const labels = records.map((r) => r.month);
    const values = records.map((r) => Number(r.amount));

    const backgroundColors = labels.map((_, i) => {
      const colors = [
        "rgba(255, 99, 132, 0.6)",
        "rgba(54, 162, 235, 0.6)",
        "rgba(255, 206, 86, 0.6)",
        "rgba(75, 192, 192, 0.6)",
        "rgba(153, 102, 255, 0.6)",
        "rgba(255, 159, 64, 0.6)",
        "rgba(199, 199, 199, 0.6)",
        "rgba(83, 102, 255, 0.6)",
        "rgba(255, 102, 255, 0.6)",
        "rgba(102, 255, 102, 0.6)",
        "rgba(255, 178, 102, 0.6)",
        "rgba(102, 178, 255, 0.6)",
      ];
      return colors[i % colors.length];
    });

    const borderColors = backgroundColors.map((c) => c.replace("0.6", "1"));

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(chartCanvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: `Financial Data for the year - (${year})`,
            data: values,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }

  function renderTable(records) {
    tableData.innerHTML = "";
    if (!records || !records.length) {
      tableData.innerHTML = '<tr><td colspan="2">No records found.</td></tr>';
      return;
    }
    records.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.month}</td><td>R ${Number(r.amount).toFixed(
        2
      )}</td>`;
      tableData.appendChild(tr);
    });
  }

  getDataBtn.addEventListener("click", () => {
    const userId = getUserIdInput.value.trim();
    const year = getYearInput.value.trim();
    fetchAndRender(userId, year);
  });

  postDataBtn.addEventListener("click", async () => {
    const userId = postUserIdInput.value.trim();
    const year = postYearInput.value.trim();
    if (!userId || !year)
      return alert("Please select User ID and Year for upload.");
    if (!getFileInput.files.length)
      return alert("Please select an Excel file.");

    const formData = new FormData();
    formData.append("file", getFileInput.files[0]);
    postResults.textContent = "Loading Data Please wait...";

    try {
      const resp = await fetch(
        `${BaseUrl}/api/finances/upload/${userId}/${year}`,
        {
          method: "POST",
          body: formData,
        }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Loading Data failed");

      postResults.textContent = "Upload successful. Fetching new data...";
      await fetchAndRender(userId, year);
      postResults.textContent = "Done.";
      getFileInput.value = "";
    } catch (err) {
      postResults.textContent = "Error: " + err.message;
    }
  });
});
