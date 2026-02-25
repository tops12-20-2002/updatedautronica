import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../Style.css";
import pdfMake from "pdfmake/build/pdfmake.min";
import pdfFonts from "pdfmake/build/vfs_fonts";

import { getInventory } from "../api/inventory";
import { getJobOrders, updateJobOrder, deleteJobOrder } from "../api/jobOrders";
import { clearAuth } from "../utils/auth";
import { logout as logoutAPI } from "../api/auth";
pdfMake.vfs = pdfFonts.vfs;

function MechanicDashboard() {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [jobOrders, setJobOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const [salesDate, setSalesDate] = useState("");
  const [salesStartDate, setSalesStartDate] = useState("");
  const [salesEndDate, setSalesEndDate] = useState("");
  const [arCashDate, setArCashDate] = useState("");
  const [arCashStartDate, setArCashStartDate] = useState("");
  const [arCashEndDate, setArCashEndDate] = useState("");
  const [salesLogDate, setSalesLogDate] = useState("");
  const [salesLogStartDate, setSalesLogStartDate] = useState("");
  const [salesLogEndDate, setSalesLogEndDate] = useState("");
  const [salesLogPaymentType, setSalesLogPaymentType] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Delete",
    onConfirm: null
  });
  const [dailyPaymentView, setDailyPaymentView] = useState("Accounts Receivable");
  const [datePaymentView, setDatePaymentView] = useState("Accounts Receivable");
  const [rangePaymentView, setRangePaymentView] = useState("Accounts Receivable");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [inventoryRes, jobOrdersRes] = await Promise.all([
        getInventory(),
        getJobOrders(),
      ]);

      if (inventoryRes.success) {
        setProducts(inventoryRes.data);
      }
      if (jobOrdersRes.success) {
        setJobOrders(jobOrdersRes.data);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      alert("Failed to load data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("token");
      if (token) {
        await logoutAPI(token);
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearAuth();
      navigate("/login");
    }
  };

  const handleDeleteJobOrder = async (jobId) => {
    try {
      const result = await deleteJobOrder(jobId);
      if (result.success) {
        await loadData();
      } else {
        alert(result.error || "Failed to delete job order");
      }
    } catch (error) {
      console.error("Error deleting job order:", error);
      alert("Failed to delete job order. Please try again.");
    }
  };

  const openConfirmDialog = ({ title, message, confirmLabel = "Delete", onConfirm }) => {
    setConfirmDialog({
      open: true,
      title,
      message,
      confirmLabel,
      onConfirm
    });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({
      open: false,
      title: "",
      message: "",
      confirmLabel: "Delete",
      onConfirm: null
    });
  };

  const handleConfirmDialog = async () => {
    if (!confirmDialog.onConfirm) {
      closeConfirmDialog();
      return;
    }
    await confirmDialog.onConfirm();
    closeConfirmDialog();
  };

  const requestDeleteJobOrder = (jobId) => {
    openConfirmDialog({
      title: "Delete Sales Log Record",
      message: "Are you sure you want to delete this completed job order?",
      onConfirm: () => handleDeleteJobOrder(jobId)
    });
  };

  const handleUpdatePaymentType = async (order, nextPaymentType) => {
    const orderData = {
      id: order.id,
      joNumber: order.joNumber || order.job_order_no,
      client: order.client || order.customer_name || "",
      address: order.address || "",
      vehicleModel: order.vehicleModel || order.model || "",
      contactNumber: order.contactNumber || order.contact_no || "",
      plate: order.plate || order.plate_no || "",
      customerType: order.customerType || order.type || "Private",
      assignedTo: order.assignedTo || order.assigned_to || "",
      dateIn: order.dateIn || order.date || "",
      dateRelease: order.dateRelease || order.date_release || null,
      status: order.status || "Pending",
      paymentType: nextPaymentType,
      services: order.services || [],
      parts: order.parts || [],
      subtotal: parseFloat(order.subtotal || 0),
      discount: parseFloat(order.discount || 0),
      total: parseFloat(order.total || order.total_amount || 0),
    };

    try {
      const result = await updateJobOrder(orderData);
      if (result.success) {
        await loadData();
      } else {
        alert(result.error || "Failed to update payment type");
      }
    } catch (error) {
      console.error("Error updating payment type:", error);
      alert("Failed to update payment type. Please try again.");
    }
  };

  const formatJobOrderNo = (num) => String(num).padStart(4, "0");
  const getOrderDate = (order) => order.dateIn || order.date || "";
  const toDateKey = (dateStr) => (dateStr ? dateStr.slice(0, 10) : "");

  const loadBase64Image = (url) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      fetch(url)
        .then((res) => res.blob())
        .then((blob) => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
    });
  };

  const normalizePdfLineItem = (item) => {
    const qty = parseFloat(item?.qty ?? item?.quantity ?? 0) || 0;
    const totalRaw = parseFloat(item?.price ?? item?.total);
    const unitRaw = parseFloat(item?.unitPrice ?? item?.unit_price);
    const total = Number.isNaN(totalRaw) ? 0 : totalRaw;
    const unitPrice = Number.isNaN(unitRaw) ? (qty > 0 ? total / qty : 0) : unitRaw;
    return { qty, unitPrice, total };
  };

  const buildJobDataFromOrder = (order) => {
    const rawNo = order?.joNumber ?? order?.job_order_no ?? 0;
    return {
      joNumber: formatJobOrderNo(rawNo),
      client: order?.client || order?.customer_name || "",
      address: order?.address || "",
      vehicleModel: order?.vehicleModel || order?.model || "",
      plateNumber: order?.plate || order?.plate_no || "",
      dateIn: order?.dateIn || order?.date || "",
      dateRelease: order?.dateRelease || order?.date_release || "",
      assignedTo: order?.assignedTo || order?.assigned_to || "",
      contactNumber: order?.contactNumber || order?.contact_no || "",
      subtotal: parseFloat(order?.subtotal || 0) || 0,
      discount: parseFloat(order?.discount || 0) || 0,
      grandTotal: parseFloat(order?.total || order?.total_amount || 0) || 0,
      services: order?.services || [],
      parts: order?.parts || []
    };
  };

  const buildPdfDocDefinition = async (jobData) => {
    const logoBase64 = await loadBase64Image(process.env.PUBLIC_URL + "/again.png");

    const serviceRows = (jobData.services || []).map((s) => {
      const { qty, unitPrice, total } = normalizePdfLineItem(s);
      return ([
        { text: s.description || "", fontSize: 10 },
        { text: qty, alignment: "center", fontSize: 10 },
        { text: s.unit || "", alignment: "center", fontSize: 10 },
        { text: unitPrice.toFixed(2), alignment: "right", fontSize: 10 },
        { text: total.toFixed(2), alignment: "right", fontSize: 10 }
      ]);
    });

    const partsRows = (jobData.parts || []).map((p) => {
      const { qty, unitPrice, total } = normalizePdfLineItem(p);
      return ([
        { text: String(p.description || "").replace(/^[^-]+-\s*/, ""), fontSize: 10 },
        { text: qty, alignment: "center", fontSize: 10 },
        { text: p.unit || "", alignment: "center", fontSize: 10 },
        { text: unitPrice.toFixed(2), alignment: "right", fontSize: 10 },
        { text: total.toFixed(2), alignment: "right", fontSize: 10 }
      ]);
    });

    return {
      pageSize: "A4",
      pageMargins: [40, 117, 40, 155],
      header: {
        margin: [40, 20, 40, 0],
        stack: [
          { image: logoBase64, width: 250, alignment: "center", margin: [0, -10, 0, 2] },
          { text: "AUTO SERVICE AND SPARE PARTS CORP.", style: "header", alignment: "center", color: "#000000" },
          { text: "MAHARLIKA HIGHWAY SITIO BAGONG TULAY BRGY. BUKAL PAGBILAO QUEZON", style: "subheader", alignment: "center", color: "#1e1e1e" },
          { text: "SMART: 09184533356   SMART: 09989990252   GLOBE: 09989990252 ", style: "subheader", alignment: "center", margin: [0, 0, 0, 10], color: "#1e1e1e" }
        ]
      },
      content: [
        {
          table: {
            widths: [78, "*", 78, "*"],
            body: [
              [
                { text: "DETAILS:", bold: true, fontSize: 11, colSpan: 2, fillColor: "#9fd0ff", margin: [0, 2, 0, 2] },
                {},
                { text: "JOB ORDER NO.: " + jobData.joNumber, bold: true, fontSize: 11, alignment: "right", colSpan: 2, fillColor: "#9fd0ff", margin: [0, 2, 0, 2] },
                {}
              ],
              [
                { text: "Client Name:", bold: true, fontSize: 10 },
                { text: jobData.client || "-", fontSize: 10 },
                { text: "Address:", bold: true, fontSize: 10 },
                { text: jobData.address || "-", fontSize: 10 }
              ],
              [
                { text: "Model:", bold: true, fontSize: 10 },
                { text: jobData.vehicleModel || "-", fontSize: 10 },
                { text: "Plate No:", bold: true, fontSize: 10 },
                { text: jobData.plateNumber || "-", fontSize: 10 }
              ],
              [
                { text: "Date In:", bold: true, fontSize: 10 },
                { text: formatDateMMDDYYYY(jobData.dateIn), fontSize: 10 },
                { text: "Date Out:", bold: true, fontSize: 10 },
                { text: formatDateMMDDYYYY(jobData.dateRelease), fontSize: 10 }
              ],
              [
                { text: "Contact No:", bold: true, fontSize: 10 },
                { text: jobData.contactNumber || "-", fontSize: 10 },
                { text: "Technician:", bold: true, fontSize: 10 },
                { text: jobData.assignedTo || "-", fontSize: 10 }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#000000",
            vLineColor: () => "#000000",
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 3,
            paddingBottom: () => 3
          },
          margin: [0, 5, 0, 15]
        },
        {
          table: {
            widths: ["*", 40, 40, 60, 60],
            body: [
              [
                { text: "SERVICES", colSpan: 5, bold: true, fontSize: 11, alignment: "center", color: "#000000", fillColor: "#9fd0ff", margin: [0, 2, 0, 2] },
                {},
                {},
                {},
                {}
              ],
              [
                { text: "JOB/ITEM DESCRIPTION", bold: true, fontSize: 8 },
                { text: "QNT", bold: true, alignment: "center", fontSize: 8 },
                { text: "UNIT", bold: true, alignment: "center", fontSize: 8 },
                { text: "AMOUNT", bold: true, alignment: "right", fontSize: 8 },
                { text: "TOTAL AMOUNT", bold: true, alignment: "right", fontSize: 8 }
              ],
              ...serviceRows,
              [
                { text: "PARTS", colSpan: 5, bold: true, fontSize: 11, alignment: "center", color: "#000000", fillColor: "#9fd0ff", margin: [0, 2, 0, 2] },
                {},
                {},
                {},
                {}
              ],
              [
                { text: "DESCRIPTION", bold: true, fontSize: 8 },
                { text: "QNT", bold: true, alignment: "center", fontSize: 8 },
                { text: "UNIT", bold: true, alignment: "center", fontSize: 8 },
                { text: "AMOUNT", bold: true, alignment: "right", fontSize: 8 },
                { text: "TOTAL AMOUNT", bold: true, alignment: "right", fontSize: 8 }
              ],
              ...partsRows
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#000000",
            vLineColor: () => "#000000",
            fillColor: (rowIndex) => {
              if (rowIndex === 0 || rowIndex === serviceRows.length + 2) return "#ffffff";
              if (rowIndex === 1 || rowIndex === serviceRows.length + 3) return "#ffffff";
              return rowIndex % 2 === 0 ? "#d9d9d9" : "#ffffff";
            }
          },
          margin: [0, 0, 0, 15]
        },
        {
          table: {
            widths: ["*", 20, 90],
            body: [
              [
                { text: "TOTAL AMOUNT:", bold: true, alignment: "right", fontSize: 11, color: "#111111", fillColor: "#9fd0ff", margin: [0, 2, 6, 2] },
                { text: "\u20b1", bold: true, alignment: "center", fontSize: 11, color: "#111111", fillColor: "#9fd0ff", margin: [0, 2, 0, 2] },
                { text: Number(jobData.grandTotal || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), bold: true, alignment: "right", fontSize: 11, color: "#111111", fillColor: "#9fd0ff", margin: [0, 2, 6, 2] }
              ]
            ]
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => "#000000",
            vLineColor: () => "#000000"
          },
          margin: [0, 0, 0, 20]
        }
      ],
      footer: function (currentPage, pageCount) {
        if (currentPage !== pageCount) {
          return { text: "" };
        }
        return {
          margin: [40, 0, 40, 20],
          stack: [
            {
              columns: [
                {
                  width: "50%",
                  stack: [
                    { text: "Chief Mechanic:", fontSize: 9, italics: true },
                    { text: "Leo Palmero", fontSize: 10, bold: true, italics: true }
                  ],
                  alignment: "center"
                },
                {
                  width: "50%",
                  stack: [
                    { text: "Prepared By:", fontSize: 9, italics: true },
                    { text: "Carmela Angulo", fontSize: 10, bold: true, italics: true }
                  ],
                  alignment: "center"
                }
              ]
            },
            { text: "", margin: [0, 15] },
            {
              text: "Note: I hereby acknowledge that all items and labor are in good condition/s",
              fontSize: 9
            },
            { text: "Received By:", fontSize: 10, margin: [0, 12, 0, 6] },
            { text: "_____________________________", fontSize: 10 },
            {
              text: "By signing this document, I acknowledge that the services and materials listed above have been completed to my satisfaction. I agree that Autronicas Auto Service and Spare Parts Corps. has fulfilled its obligation and that I am satisfied with the work provided.",
              fontSize: 8,
              alignment: "center",
              margin: [0, 25, 0, 0]
            }
          ]
        };
      },
      styles: { header: { fontSize: 16, bold: true }, subheader: { fontSize: 10, bold: true }, sectitle: { fontSize: 11, bold: true, color: "#0b5ed7", margin: [0, 5, 0, 5] } }
    };
  };

  const viewSalesLogPDF = async (order) => {
    const jobData = buildJobDataFromOrder(order);
    const docDefinition = await buildPdfDocDefinition(jobData);
    pdfMake.createPdf(docDefinition).open();
  };

  const computeOrderTotals = (order) => {
    const servicesList = order.services || [];
    const partsList = order.parts || [];

    const totalLabor = servicesList.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
    const totalPartsPrice = partsList.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);

    let unitPriceTotal = 0;
    partsList.forEach((p) => {
      const qty = parseFloat(p.qty) || 0;
      const code = (p.description || "").split(" - ")[0]?.trim();
      const product = products.find((prod) => prod.code?.toLowerCase() === (code || "").toLowerCase());
      if (product) {
        const unitCost = parseFloat(product.price) || 0;
        unitPriceTotal += unitCost * qty;
      }
    });

    const discountValue = parseFloat(order.discount) || 0;
    const totalAmount = totalLabor + totalPartsPrice - discountValue;
    const profit = totalPartsPrice - unitPriceTotal;

    return { totalLabor, totalPartsPrice, unitPriceTotal, totalAmount, profit, discountValue };
  };

  const completedOrders = jobOrders.filter((o) => o.status === "Completed");
  const todayKey = new Date().toISOString().slice(0, 10);

  const getPaymentType = (order) => {
    const paymentType = (order.paymentType || order.payment_type || "Cash").trim();
    return paymentType === "Accounts Receivable" ? "Accounts Receivable" : "Cash";
  };

  const formatDateMMDDYYYY = (rawValue) => {
    if (!rawValue) return "-";
    const normalized = String(rawValue).replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return String(rawValue);
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric"
    });
  };
  
  const summarizeByPaymentType = (orders) => {
    return orders.reduce(
      (acc, order) => {
        const totals = computeOrderTotals(order);
        if (getPaymentType(order) === "Accounts Receivable") {
          acc.arSales += totals.totalAmount;
          acc.arProfit += totals.profit;
        } else {
          acc.cashSales += totals.totalAmount;
          acc.cashProfit += totals.profit;
        }
        return acc;
      },
      { arSales: 0, arProfit: 0, cashSales: 0, cashProfit: 0 }
    );
  };

  const dailySales = completedOrders.reduce((sum, o) => {
    if (toDateKey(getOrderDate(o)) !== todayKey) return sum;
    return sum + computeOrderTotals(o).totalAmount;
  }, 0);

  const dailyProfit = completedOrders.reduce((sum, o) => {
    if (toDateKey(getOrderDate(o)) !== todayKey) return sum;
    return sum + computeOrderTotals(o).profit;
  }, 0);

  const dailyOrders = completedOrders.filter((o) => toDateKey(getOrderDate(o)) === todayKey);
  const dailyByPaymentType = summarizeByPaymentType(dailyOrders);

  const salesByDate = salesDate
    ? completedOrders.filter((o) => toDateKey(getOrderDate(o)) === salesDate)
    : [];

  const salesByRange = salesStartDate && salesEndDate
    ? completedOrders.filter((o) => {
        const key = toDateKey(getOrderDate(o));
        return key >= salesStartDate && key <= salesEndDate;
      })
    : [];

  const totalSalesByDate = salesByDate.reduce((sum, o) => sum + computeOrderTotals(o).totalAmount, 0);
  const totalProfitByDate = salesByDate.reduce((sum, o) => sum + computeOrderTotals(o).profit, 0);

  const totalSalesByRange = salesByRange.reduce((sum, o) => sum + computeOrderTotals(o).totalAmount, 0);
  const totalProfitByRange = salesByRange.reduce((sum, o) => sum + computeOrderTotals(o).profit, 0);
  const arCashByDate = arCashDate
    ? completedOrders.filter((o) => toDateKey(getOrderDate(o)) === arCashDate)
    : [];

  const arCashByRange = arCashStartDate && arCashEndDate
    ? completedOrders.filter((o) => {
        const key = toDateKey(getOrderDate(o));
        return key >= arCashStartDate && key <= arCashEndDate;
      })
    : [];

  const dateByPaymentType = summarizeByPaymentType(arCashByDate);
  const rangeByPaymentType = summarizeByPaymentType(arCashByRange);

  const filteredSalesOrders = salesLogStartDate && salesLogEndDate
    ? completedOrders.filter((o) => {
        const key = toDateKey(getOrderDate(o));
        return key >= salesLogStartDate && key <= salesLogEndDate;
      })
    : salesLogDate
      ? completedOrders.filter((o) => toDateKey(getOrderDate(o)) === salesLogDate)
      : completedOrders;

  const paymentFilteredSalesOrders = salesLogPaymentType
    ? filteredSalesOrders.filter((o) => getPaymentType(o) === salesLogPaymentType)
    : filteredSalesOrders;

  const searchedSalesOrders = salesSearch.trim()
    ? paymentFilteredSalesOrders.filter((o) => {
        const query = salesSearch.trim().toLowerCase();
        const haystack = [
          toDateKey(getOrderDate(o)) || "",
          formatJobOrderNo(o.joNumber ?? o.job_order_no ?? 0),
          o.vehicleModel || o.model || "",
          o.plate || o.plate_no || "",
          o.client || o.customer_name || "",
          getPaymentType(o),
          o.status || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : paymentFilteredSalesOrders;

  const sortedSalesOrders = [...searchedSalesOrders].sort((a, b) => {
    const aNo = parseInt(a.joNumber ?? a.job_order_no ?? 0, 10) || 0;
    const bNo = parseInt(b.joNumber ?? b.job_order_no ?? 0, 10) || 0;
    if (aNo !== bNo) return bNo - aNo;
    return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
  });

  const handleDatePaymentViewChange = (nextPaymentView) => {
    setDatePaymentView(nextPaymentView);
    if (arCashDate) {
      setSalesLogDate(arCashDate);
      setSalesLogStartDate("");
      setSalesLogEndDate("");
      setSalesLogPaymentType(nextPaymentView);
    }
  };

  const handleRangePaymentViewChange = (nextPaymentView) => {
    setRangePaymentView(nextPaymentView);
    if (arCashStartDate && arCashEndDate) {
      setSalesLogDate("");
      setSalesLogStartDate(arCashStartDate);
      setSalesLogEndDate(arCashEndDate);
      setSalesLogPaymentType(nextPaymentView);
    }
  };

  const renderPaymentToggle = (value, onChange) => (
    <div className="payment-toggle" role="tablist" aria-label="Payment type toggle">
      <button
        type="button"
        className={`payment-toggle-btn ${value === "Accounts Receivable" ? "active" : ""}`}
        onClick={() => onChange("Accounts Receivable")}
      >
        AR
      </button>
      <button
        type="button"
        className={`payment-toggle-btn ${value === "Cash" ? "active" : ""}`}
        onClick={() => onChange("Cash")}
      >
        Cash
      </button>
    </div>
  );

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>;
  }

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="content">
          <div className="left">
            <img src={process.env.PUBLIC_URL + "/HeaderLogo.png"} className="admin-logo" alt="Autronicas logo" />
          </div>
          <nav className="admin-nav">
            <button className="active">Sales</button>
            <button className="logout" onClick={handleLogout}>Logout</button>
          </nav>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="sales-section">
          <h2>Sales Management</h2>
          <div className="sales-cards">
            <div className="sales-card">
              <h4>Daily Summary Report</h4>
              <p>Total Sales: ₱{dailySales.toFixed(2)}</p>
              <p>Total Profit: ₱{dailyProfit.toFixed(2)}</p>
            </div>
            <div className="sales-card">
              <h4>View Sales by Date</h4>
              <input
                type="date"
                value={salesDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setSalesDate(value);
                  setSalesLogDate(value);
                  setSalesLogStartDate("");
                  setSalesLogEndDate("");
                  setSalesLogPaymentType("");
                }}
              />
              <p>Showing sales for: {salesDate || "-"}</p>
              <p>Total Sales: ₱{totalSalesByDate.toFixed(2)}</p>
              <p>Total Profit: ₱{totalProfitByDate.toFixed(2)}</p>
            </div>
            <div className="sales-card">
              <h4>Sales by Date Range</h4>
              <div className="sales-range">
                <label>Start:</label>
                <input
                  type="date"
                  value={salesStartDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSalesStartDate(value);
                    setSalesLogDate("");
                    setSalesLogStartDate(value);
                    setSalesLogEndDate(salesEndDate);
                    setSalesLogPaymentType("");
                  }}
                />
                <label>End:</label>
                <input
                  type="date"
                  value={salesEndDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSalesEndDate(value);
                    setSalesLogDate("");
                    setSalesLogStartDate(salesStartDate);
                    setSalesLogEndDate(value);
                    setSalesLogPaymentType("");
                  }}
                />
              </div>
              <p>Total: ₱{totalSalesByRange.toFixed(2)}</p>
              <p>Total Profit: ₱{totalProfitByRange.toFixed(2)}</p>
            </div>
            <div className="sales-card">
              <div className="sales-card-header">
                <h4>Daily AR / Cash</h4>
                {renderPaymentToggle(dailyPaymentView, setDailyPaymentView)}
              </div>
              {dailyPaymentView === "Accounts Receivable" ? (
                <>
                  <p>AR Sales: PHP {dailyByPaymentType.arSales.toFixed(2)}</p>
                  <p>AR Profit: PHP {dailyByPaymentType.arProfit.toFixed(2)}</p>
                </>
              ) : (
                <>
                  <p>Cash Sales: PHP {dailyByPaymentType.cashSales.toFixed(2)}</p>
                  <p>Cash Profit: PHP {dailyByPaymentType.cashProfit.toFixed(2)}</p>
                </>
              )}
            </div>
            <div className="sales-card">
              <div className="sales-card-header">
                <h4>AR / Cash by Date</h4>
                {renderPaymentToggle(datePaymentView, handleDatePaymentViewChange)}
              </div>
              <input
                type="date"
                value={arCashDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setArCashDate(value);
                  setSalesLogDate(value);
                  setSalesLogStartDate("");
                  setSalesLogEndDate("");
                  setSalesLogPaymentType(value ? datePaymentView : "");
                }}
              />
              <p>Showing for: {arCashDate || "-"}</p>
              {datePaymentView === "Accounts Receivable" ? (
                <>
                  <p>AR Sales: PHP {dateByPaymentType.arSales.toFixed(2)}</p>
                  <p>AR Profit: PHP {dateByPaymentType.arProfit.toFixed(2)}</p>
                </>
              ) : (
                <>
                  <p>Cash Sales: PHP {dateByPaymentType.cashSales.toFixed(2)}</p>
                  <p>Cash Profit: PHP {dateByPaymentType.cashProfit.toFixed(2)}</p>
                </>
              )}
            </div>
            <div className="sales-card">
              <div className="sales-card-header">
                <h4>AR / Cash by Date Range</h4>
                {renderPaymentToggle(rangePaymentView, handleRangePaymentViewChange)}
              </div>
              <div className="sales-range">
                <label>Start:</label>
                <input
                  type="date"
                  value={arCashStartDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setArCashStartDate(value);
                    setSalesLogDate("");
                    setSalesLogStartDate(value);
                    setSalesLogEndDate(arCashEndDate);
                    setSalesLogPaymentType(value && arCashEndDate ? rangePaymentView : "");
                  }}
                />
                <label>End:</label>
                <input
                  type="date"
                  value={arCashEndDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setArCashEndDate(value);
                    setSalesLogDate("");
                    setSalesLogStartDate(arCashStartDate);
                    setSalesLogEndDate(value);
                    setSalesLogPaymentType(arCashStartDate && value ? rangePaymentView : "");
                  }}
                />
              </div>
              {rangePaymentView === "Accounts Receivable" ? (
                <>
                  <p>AR Sales: PHP {rangeByPaymentType.arSales.toFixed(2)}</p>
                  <p>AR Profit: PHP {rangeByPaymentType.arProfit.toFixed(2)}</p>
                </>
              ) : (
                <>
                  <p>Cash Sales: PHP {rangeByPaymentType.cashSales.toFixed(2)}</p>
                  <p>Cash Profit: PHP {rangeByPaymentType.cashProfit.toFixed(2)}</p>
                </>
              )}
            </div>
          </div>
          

          <div className="sales-log-header">
            <h3>Sales Log</h3>
            <div className="sales-log-actions">
              <div className="sales-search">
                <label>Search:</label>
                <input
                  type="text"
                  placeholder="JO no, plate, model, client..."
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                />
              </div>
              <div className="sales-filter">
                <label>Date:</label>
                <input
                  type="date"
                  value={salesLogDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSalesLogDate(value);
                    setSalesLogStartDate("");
                    setSalesLogEndDate("");
                    setSalesLogPaymentType("");
                  }}
                />
              </div>
            </div>
          </div>
          <div className="sales-table-wrapper">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Job Order No.</th>
                  <th>Vehicle / Plate No.</th>
                  <th>Total Service (₱)</th>
                  <th>Total Parts Price (₱)</th>
                  <th>Unit Price (₱)</th>
                  <th>Discount (₱)</th>
                  <th>Total Amount (₱)</th>
                  <th>Profit (₱)</th>
                  <th>Status</th>
                  <th>Payment Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedSalesOrders.length === 0 ? (
                  <tr><td colSpan="12" className="empty-message">No sales records yet.</td></tr>
                ) : (
                  sortedSalesOrders.map((o) => {
                    const totals = computeOrderTotals(o);
                    return (
                      <tr key={`sales-${o.id}`}>
                        <td>{toDateKey(getOrderDate(o)) || "-"}</td>
                        <td>{formatJobOrderNo(o.joNumber ?? o.job_order_no ?? 0)}</td>
                        <td>{o.vehicleModel || o.model || "-"} / {o.plate || o.plate_no || "-"}</td>
                        <td>₱{totals.totalLabor.toFixed(2)}</td>
                        <td>₱{totals.totalPartsPrice.toFixed(2)}</td>
                        <td>₱{totals.unitPriceTotal.toFixed(2)}</td>
                        <td>₱{totals.discountValue.toFixed(2)}</td>
                        <td>₱{totals.totalAmount.toFixed(2)}</td>
                        <td>₱{totals.profit.toFixed(2)}</td>
                        <td>
                          <span className={o.status === "Pending" ? "status-tag yellow" : o.status === "In Progress" ? "status-tag blue" : "status-tag green"}>
                            {o.status}
                          </span>
                        </td>
                        <td>
                          <select
                            value={o.paymentType || o.payment_type || "Cash"}
                            onChange={(e) => handleUpdatePaymentType(o, e.target.value)}
                            style={{ marginBottom: 0 }}
                          >
                            <option value="Accounts Receivable">Accounts Receivable</option>
                            <option value="Cash">Cash</option> 
                          </select>
                        </td>
                        <td>
                          <button className="view-edit-btn" onClick={() => viewSalesLogPDF(o)}>View</button>
                          <button className="delete-btn" onClick={() => requestDeleteJobOrder(o.id)} style={{ marginLeft: 8 }}>Delete</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {confirmDialog.open && (
        <div className="modal-container centered-modal">
          <div className="modal-box product-modal" style={{ maxWidth: 460 }}>
            <div className="product-modal-header">
              <h2>{confirmDialog.title}</h2>
            </div>
            <div className="product-modal-body">
              <p>{confirmDialog.message}</p>
            </div>
            <div className="product-modal-footer modal-actions">
              <button className="cancel" onClick={closeConfirmDialog}>Cancel</button>
              <button className="delete-btn" onClick={handleConfirmDialog}>{confirmDialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MechanicDashboard;
