import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../Style.css";
import pdfMake from "pdfmake/build/pdfmake.min";
import pdfFonts from "pdfmake/build/vfs_fonts";

import { getInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem } from "../api/inventory";
import { getJobOrders, createJobOrder, updateJobOrder, deleteJobOrder } from "../api/jobOrders";
import { getDashboardStats } from "../api/dashboard";
import { clearAuth } from "../utils/auth";
import { logout as logoutAPI } from "../api/auth";
pdfMake.vfs = pdfFonts.vfs;

function AdminDashboard() {
  const navigate = useNavigate();
  const toUpperInput = (value) => String(value ?? "").toUpperCase();

  const formatJobOrderNo = (num) => String(num).padStart(4, "0");

  const [activeTab, setActiveTab] = useState("dashboard");
  const [tabDirection, setTabDirection] = useState("none");
  const [products, setProducts] = useState([]);
  const [jobOrders, setJobOrders] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // JOB ORDER STATES
  const [showJobOrderModal, setShowJobOrderModal] = useState(false);
  const [editJobId, setEditJobId] = useState(null);
  const [jobFilterDirection, setJobFilterDirection] = useState("none");
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    message: "",
    confirmLabel: "Delete",
    onConfirm: null
  });
  const [infoDialog, setInfoDialog] = useState({
    open: false,
    title: "",
    message: ""
  });
  const [jobStatusFilter, setJobStatusFilter] = useState("All");
  const [isJobReadOnly, setIsJobReadOnly] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const inventorySearchInputRef = useRef(null);

  // form fields
  const [jobOrderNo, setJobOrderNo] = useState(0);
  const [clientName, setClientName] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [dateIn, setDateIn] = useState("");
  const [dateRelease, setDateRelease] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [status, setStatus] = useState("Pending");
  const [paymentType, setPaymentType] = useState("Cash");
  const [address, setAddress] = useState("");
  const [services, setServices] = useState([{ description: "", qty: "", unit: "", price: "", unitPrice: "" }]);
  const [parts, setParts] = useState([{ description: "", qty: "", unit: "", price: "", unitPrice: "" }]);

  const [subtotal, setSubtotal] = useState(0);
  const [discount, setDiscount] = useState("");
  const [grandTotal, setGrandTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [inventoryRes, jobOrdersRes, dashboardRes] = await Promise.all([
        getInventory(),
        getJobOrders(),
        getDashboardStats(),
      ]);

      if (inventoryRes.success) {
        setProducts(inventoryRes.data);
      }
      if (jobOrdersRes.success) {
        setJobOrders(jobOrdersRes.data);
        // Reuse deleted JO numbers first (smallest available completed number).
        const used = new Set(
          (jobOrdersRes.data || [])
            .filter((o) => (o?.status || "") === "Completed")
            .map((o) => parseInt(o?.job_order_no ?? o?.joNumber ?? 0, 10))
            .filter((n) => Number.isInteger(n) && n > 0)
        );
        let next = 1;
        while (used.has(next)) next += 1;
        setJobOrderNo(next);
      }
      if (dashboardRes.success) {
        setDashboardStats(dashboardRes.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data from API
  useEffect(() => {
    loadData();
  }, [loadData]);

  // compute totals
  const calculateTotals = () => {
    const serviceTotal = services.reduce((sum, s) => {
      const total = parseFloat(s.price) || 0;
      return sum + total;
    }, 0);

    const partsTotal = parts.reduce((sum, p) => {
      const total = parseFloat(p.price) || 0;
      return sum + total;
    }, 0);

    const total = serviceTotal + partsTotal;
    const discountValue = parseFloat(discount);
    const discountAmount = Number.isNaN(discountValue) ? 0 : discountValue;

    setSubtotal(total);
    setGrandTotal(total - discountAmount);
  };

  useEffect(() => {
    calculateTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, parts, customerType, discount]);

  const computeOrderTotals = (order) => {
    const servicesList = order.services || [];
    const partsList = order.parts || [];

    const totalLabor = servicesList.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
    const totalPartsPrice = partsList.reduce((sum, p) => sum + (parseFloat(p.price) || 0), 0);

    let unitPriceTotal = 0;
    partsList.forEach((p) => {
      const qty = parseFloat(p.qty) || 0;
      const code = (p.description || "").split(" - ")[0]?.trim();
      const product = products.find(prod => prod.code?.toLowerCase() === (code || "").toLowerCase());
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

  const completedOrders = jobOrders.filter(o => o.status === "Completed");
  const totalProfit = completedOrders.reduce((sum, o) => {
    const totals = computeOrderTotals(o);
    return sum + totals.profit;
  }, 0);

  const getCustomerMultiplier = (type) => {
    const vat = 1.12;
    if (type === "LGU") return 1.60 * vat;
    if (type === "STAN") return 1.30 * vat;
    return 1.25 * vat; // Private default
  };

  // add / update / delete service rows
  const addServiceRow = () => {
    setServices((prev) => [...prev, { description: "", qty: "", unit: "", price: "" }]);
  };
  const updateService = (index, field, value) => {
    const nextValue = (field === "description" || field === "unit") ? toUpperInput(value) : value;
    setServices(prev => {
      const copy = [...prev];
      const currentRow = { ...copy[index] };

      // Replace 0 with first typed value
      if (field === "price" && (currentRow.price === "0" || currentRow.price === 0)) {
        currentRow.price = nextValue;
      } else {
        currentRow[field] = nextValue;
      }

      // Store unit price
      if (field === "price") {
        if (nextValue === "") {
          currentRow.unitPrice = "";
          currentRow.price = "";
        } else {
          const qty = parseFloat(currentRow.qty) || 0;
          const unit = parseFloat(nextValue) || 0;
          currentRow.unitPrice = nextValue;
          currentRow.price = (qty * unit).toFixed(2); // update total
        }
      }

      // Update total if qty changes
      if (field === "qty") {
        const qty = parseFloat(nextValue) || 0;
        const unit = parseFloat(currentRow.unitPrice);
        if (currentRow.unitPrice === "" || Number.isNaN(unit)) {
          currentRow.price = "";
        } else {
          currentRow.price = (qty * unit).toFixed(2);
        }
      }

      copy[index] = currentRow;
      return copy;
    });
  };

  const deleteService = (index) => {
    setServices((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  // parts row handlers
  const addPartRow = () => {
    setParts((prev) => [...prev, { description: "", qty: "", unit: "", price: "", unitPrice: "" }]);
  };

  const isPartOutOfStock = (product) => {
    const stock = parseFloat(product?.stocks ?? product?.quantity ?? 0) || 0;
    const statusText = String(product?.status || "").trim().toLowerCase();
    return stock <= 0 || statusText === "out of stock";
  };

  const parsePartCodeFromInput = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const parts = raw.split(" - ");
    return (parts[0] || "").trim();
  };

  const findProductByPartValue = (value) => {
    const code = parsePartCodeFromInput(value).toLowerCase();
    if (!code) return null;
    return products.find((p) => String(p.code || "").trim().toLowerCase() === code) || null;
  };

  const getPartStockValidationError = (partRow) => {
    const product = findProductByPartValue(partRow?.description);
    if (!product) return "";

    const stock = parseFloat(product?.stocks ?? product?.quantity ?? 0) || 0;
    const qty = parseFloat(partRow?.qty) || 0;
    const label = `${product.code} - ${product.name}`;

    if (isPartOutOfStock(product)) {
      return `Part "${label}" is out of stock.`;
    }
    if (qty > stock) {
      return `Insufficient stock for "${label}".\nAvailable: ${stock}\nRequested: ${qty}`;
    }
    return "";
  };

  const validatePartsStockBeforeSave = () => {
    for (const p of parts) {
      const isBlank =
        !p.description?.trim() &&
        !p.unit?.trim() &&
        (!p.qty || p.qty === "0") &&
        (!p.unitPrice || p.unitPrice === "0") &&
        (!p.price || p.price === "0");
      if (isBlank) continue;

      const error = getPartStockValidationError(p);
      if (error) {
        setInfoDialog({
          open: true,
          title: "Invalid Part Quantity",
          message: error
        });
        return false;
      }
    }
    return true;
  };

  const updatePart = (index, field, value, options = {}) => {
    let stockErrorMessage = "";
    const nextValue = (field === "description" || field === "unit") ? toUpperInput(value) : value;

    setParts(prev => {
      const copy = [...prev];
      const currentRow = { ...copy[index] };
      const previousQty = currentRow.qty;
      const wasBlank = !currentRow.description?.trim() && !currentRow.unit?.trim() && !currentRow.qty && !currentRow.unitPrice && !currentRow.price;

      if (field === "price" && (currentRow.price === "0" || currentRow.price === 0)) {
        currentRow.price = nextValue;
      } else {
        currentRow[field] = nextValue;
      }

      // AUTO-FILL UNIT PRICE ONLY WHEN ENTER IS PRESSED
      if (field === "description" && options.commit === true) {
        const product = products.find(
          p => p.code?.toLowerCase() === nextValue.trim().toLowerCase()
        );

        if (product) {
          if (isPartOutOfStock(product)) {
            stockErrorMessage = `Part "${product.code} - ${product.name}" is out of stock.`;
            currentRow.unit = "";
            currentRow.baseUnitPrice = "";
            currentRow.unitPrice = "";
            currentRow.price = "";
            copy[index] = currentRow;
            return copy;
          }

          const baseUnit = parseFloat(product.price || 0);
          const multiplier = getCustomerMultiplier(customerType);
          const unit = baseUnit * multiplier;
          const qty = parseFloat(currentRow.qty) || 0;

          if (qty > (parseFloat(product.stocks ?? product.quantity ?? 0) || 0)) {
            stockErrorMessage = `Insufficient stock for "${product.code} - ${product.name}".\nAvailable: ${product.stocks ?? product.quantity ?? 0}\nRequested: ${qty}`;
            currentRow.qty = "";
            currentRow.unitPrice = unit.toFixed(2);
            currentRow.price = "";
            copy[index] = currentRow;
            return copy;
          }

          currentRow.description = `${product.code} - ${product.name}`;
          currentRow.baseUnitPrice = String(baseUnit);
          currentRow.unitPrice = unit.toFixed(2);
          currentRow.price = (qty * unit).toFixed(2);

          // If user scanned into the last blank row, add a new blank row for the next scan
          if (index === copy.length - 1 && wasBlank) {
            copy.push({ description: "", qty: "", unit: "", price: "", unitPrice: "" });
          }
        }
      }

      // Store unit price and update total when unit price changes
      if (field === "price") {
        if (nextValue === "") {
          currentRow.unitPrice = "";
          currentRow.price = "";
        } else {
          const qty = parseFloat(currentRow.qty) || 0;
          const unit = parseFloat(nextValue) || 0;
          currentRow.unitPrice = nextValue;
          currentRow.price = (qty * unit).toFixed(2);
        }
      }

      // Update total if qty changes
      if (field === "qty") {
        const qty = parseFloat(nextValue) || 0;
        const matchedProduct = findProductByPartValue(currentRow.description);
        const stock = parseFloat(matchedProduct?.stocks ?? matchedProduct?.quantity ?? 0) || 0;
        if (matchedProduct && qty > stock) {
          stockErrorMessage = `Insufficient stock for "${matchedProduct.code} - ${matchedProduct.name}".\nAvailable: ${stock}\nRequested: ${qty}`;
          currentRow.qty = previousQty;
        }
        const unit = parseFloat(currentRow.unitPrice);
        const effectiveQty = parseFloat(currentRow.qty) || 0;
        if (currentRow.unitPrice === "" || Number.isNaN(unit)) {
          currentRow.price = "";
        } else {
          currentRow.price = (effectiveQty * unit).toFixed(2);
        }
      }

      copy[index] = currentRow;
      return copy;
    });

    if (stockErrorMessage) {
      setInfoDialog({
        open: true,
        title: "Invalid Part Quantity",
        message: stockErrorMessage
      });
    }
  };

  useEffect(() => {
    setParts(prev => prev.map(p => {
      if (!p.baseUnitPrice) return p;
      const baseUnit = parseFloat(p.baseUnitPrice) || 0;
      const multiplier = getCustomerMultiplier(customerType);
      const unit = baseUnit * multiplier;
      const qty = parseFloat(p.qty) || 0;
      return {
        ...p,
        unitPrice: unit.toFixed(2),
        price: p.unitPrice === "" && p.price === "" ? "" : (qty * unit).toFixed(2)
      };
    }));
  }, [customerType]);


  const deletePart = (index) => {
    setParts((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const isJobFormValid = () => {
    if (!clientName.trim() || !customerType || !dateIn || !assignedTo.trim()) return false;

    const isServiceRowBlank = (s) =>
      !s.description?.trim() && !s.unit?.trim() && (!s.qty || s.qty === "0") && (!s.unitPrice || s.unitPrice === "0") && (!s.price || s.price === "0");

    const isPartRowBlank = (p) =>
      !p.description?.trim() && !p.unit?.trim() && (!p.qty || p.qty === "0") && (!p.unitPrice || p.unitPrice === "0") && (!p.price || p.price === "0");

    for (const s of services) {
      if (isServiceRowBlank(s)) continue;
      if (!s.description?.trim() || !s.unit?.trim() || !s.qty || s.price === "" || isNaN(parseFloat(s.price))) return false;
    }

    for (const p of parts) {
      if (isPartRowBlank(p)) continue;
      if (!p.description?.trim() || !p.unit?.trim() || !p.qty || p.price === "" || isNaN(parseFloat(p.price))) return false;
    }

    return true;
  };

  const persistJobOrder = async (statusOverride = null) => {
    if (!isJobFormValid()) return null;
    if (!validatePartsStockBeforeSave()) return null;

    const orderData = {
      client: clientName,
      address,
      vehicleModel,
      contactNumber,
      plate: plateNumber,
      customerType,
      assignedTo,
      dateIn,
      dateRelease: dateRelease || null,
      status: statusOverride || status,
      paymentType,
      services,
      parts,
      subtotal,
      discount,
      total: grandTotal,
    };

    // If editing, include id and joNumber
    if (editJobId !== null) {
      const existingJob = jobOrders.find(j => j.id === editJobId);
      orderData.id = editJobId;
      orderData.joNumber = existingJob?.joNumber || existingJob?.job_order_no;
    }

    try {
      let result;
      if (editJobId !== null) {
        result = await updateJobOrder(orderData);
      } else {
        result = await createJobOrder(orderData);
      }

      if (result.success) {
        await loadData(); // Reload data
        resetJobForm();
        setShowJobOrderModal(false);
        setEditJobId(null);
        return result.data || null;
      } else {
        const errorMessage = result.error || 'Failed to save job order';
        if (/out of stock|insufficient stock/i.test(errorMessage)) {
          setInfoDialog({
            open: true,
            title: "Invalid Part Quantity",
            message: errorMessage
          });
        } else {
          alert(errorMessage);
        }
        return null;
      }
    } catch (error) {
      console.error('Error saving job order:', error);
      alert('Failed to save job order. Please try again.');
      return null;
    }
  };

  // save job order - API call
  const saveJobOrder = async () => {
    await persistJobOrder();
  };

  const handleDeleteJobOrder = async (jobId) => {
    try {
      const result = await deleteJobOrder(jobId);
      if (result.success) {
        await loadData();
      } else {
        alert(result.error || 'Failed to delete job order');
      }
    } catch (error) {
      console.error('Error deleting job order:', error);
      alert('Failed to delete job order. Please try again.');
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

  const closeInfoDialog = () => {
    setInfoDialog({
      open: false,
      title: "",
      message: ""
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

  const resetJobForm = () => {
    setClientName("");
    setVehicleModel("");
    setPlateNumber("");
    setCustomerType("");
    setContactNumber("");
    setDateIn("");
    setDateRelease("");
    setAssignedTo("");
    setStatus("Pending");
    setPaymentType("Cash");
    setAddress("");
    setServices([{ description: "", qty: "", unit: "", price: "", unitPrice: "" }]);
    setParts([{ description: "", qty: "", unit: "", price: "", unitPrice: "" }]);
    setSubtotal(0);
    setDiscount("");
    setGrandTotal(0);
    setIsJobReadOnly(false);
  };

  // handle edit
  const handleEditJob = (jobId) => {
    const job = jobOrders.find(j => j.id === jobId);
    if (!job) return;

    const normalizedServices = job.services && job.services.length > 0
      ? job.services.map((s) => {
          const qtyValue = s.qty ?? s.quantity ?? "";
          const qtyNumber = parseFloat(qtyValue) || 0;
          const totalPrice = s.price ?? s.total ?? "";
          const parsedTotal = parseFloat(totalPrice);
          const fallbackUnitPrice = qtyNumber > 0 && !Number.isNaN(parsedTotal)
            ? (parsedTotal / qtyNumber).toFixed(2)
            : "";
          return {
            description: s.description ?? "",
            unit: s.unit ?? "",
            qty: qtyValue,
            price: totalPrice,
            unitPrice: s.unitPrice ?? s.unit_price ?? fallbackUnitPrice,
          };
        })
      : [{ description: "", unit: "", qty: "", price: "", unitPrice: "" }];

    const normalizedParts = job.parts && job.parts.length > 0
      ? job.parts.map((p) => {
          const qtyValue = p.qty ?? p.quantity ?? "";
          const qtyNumber = parseFloat(qtyValue) || 0;
          const totalPrice = p.price ?? p.total ?? "";
          const parsedTotal = parseFloat(totalPrice);
          const fallbackUnitPrice = qtyNumber > 0 && !Number.isNaN(parsedTotal)
            ? (parsedTotal / qtyNumber).toFixed(2)
            : "";
          return {
            description: p.description ?? "",
            unit: p.unit ?? "",
            qty: qtyValue,
            price: totalPrice,
            unitPrice: p.unitPrice ?? p.unit_price ?? fallbackUnitPrice,
          };
        })
      : [{ description: "", qty: "", unit: "", price: "", unitPrice: "" }];

    setEditJobId(jobId);
    setIsJobReadOnly(job.status === "Completed");
    setClientName(job.client || job.customer_name || "");
    setVehicleModel(job.vehicleModel || job.model || "");
    setPlateNumber(job.plate || job.plate_no || "");
    setCustomerType(job.customerType || job.type || "Private");
    setAddress(job.address || "");
    setContactNumber(job.contactNumber || job.contact_no || "");
    setDateIn(job.dateIn || job.date || "");
    setDateRelease(job.dateRelease || job.date_release || "");
    setAssignedTo(job.assignedTo || job.assigned_to || "");
    setStatus(job.status || "Pending");
    setPaymentType(job.paymentType || job.payment_type || "Cash");
    setServices(normalizedServices);
    setParts(normalizedParts);
    setSubtotal(parseFloat(job.subtotal || 0));
    setDiscount(job.discount === null || job.discount === undefined ? "" : String(job.discount));
    setGrandTotal(parseFloat(job.total || job.total_amount || 0));
    setShowJobOrderModal(true);
  };

  // PRODUCT STATES
  const [showModal, setShowModal] = useState(false);
  const [newProduct, setNewProduct] = useState({
    code: "",
    partNumber: "",
    name: "",
    quantity: "",
    price: "",
    srpPrivate: "",
    srpLgu: "",
    srpStan: "",
    companyCodename: ""
  });
  const [editProductId, setEditProductId] = useState(null);
  const [isEditModal, setIsEditModal] = useState(false);

  const logoSrc = process.env.PUBLIC_URL + "/HeaderLogo.png";

  const isFormValid = () => newProduct.name.trim() !== "" && newProduct.quantity !== "" && newProduct.price !== "";

  // ADD PRODUCT HANDLER
  const handleAddProduct = async () => {
    if (!isFormValid()) return;

    // Check for duplicate before saving
    const existing = products.find(p => p.code === newProduct.code.trim());
    if (existing) {
      alert(`Item with code "${newProduct.code}" is already in the inventory (Product: ${existing.name}).`);
      return;
    }

    try {
      const result = await createInventoryItem({
        name: newProduct.name,
        quantity: parseInt(newProduct.quantity),
        price: parseFloat(newProduct.price),
        srpPrivate: parseFloat(newProduct.srpPrivate || 0),
        srpLgu: parseFloat(newProduct.srpLgu || 0),
        srpStan: parseFloat(newProduct.srpStan || 0),
        companyCodename: newProduct.companyCodename,
        code: newProduct.code,
        partNumber: newProduct.partNumber
      });

      if (result.success) {
        await loadData();
        setNewProduct({
          code: "",
          partNumber: "",
          name: "",
          quantity: "",
          price: "",
          srpPrivate: "",
          srpLgu: "",
          srpStan: "",
          companyCodename: ""
        });
        setShowModal(false);
      } else {
        alert(result.error || 'Failed to add product');
      }
    } catch (error) {
      console.error('Error adding product:', error);
      alert('Failed to add product. Please try again.');
    }
  };

  const openEditModal = (productId) => {
    const p = products.find(prod => prod.id === productId);
    if (!p) return;
    setEditProductId(productId);
    setIsEditModal(true);
    setNewProduct({
      code: p.code,
      partNumber: p.part_number || p.partNumber || "",
      name: p.name,
      quantity: p.stocks,
      price: p.price,
      srpPrivate: p.srp_private ?? "",
      srpLgu: p.srp_lgu ?? "",
      srpStan: p.srp_stan ?? "",
      companyCodename: p.company_codename
    });
  };

  const handleSaveEdit = async () => {
    if (!isFormValid()) return;

    try {
      const result = await updateInventoryItem({
        id: editProductId,
        code: newProduct.code,
        name: newProduct.name,
        quantity: parseInt(newProduct.quantity),
        price: parseFloat(newProduct.price),
        srpPrivate: parseFloat(newProduct.srpPrivate || 0),
        srpLgu: parseFloat(newProduct.srpLgu || 0),
        srpStan: parseFloat(newProduct.srpStan || 0),
        companyCodename: newProduct.companyCodename,
        partNumber: newProduct.partNumber
      });

      if (result.success) {
        await loadData();
        setIsEditModal(false);
        setEditProductId(null);
        setNewProduct({
          code: "",
          partNumber: "",
          name: "",
          quantity: "",
          price: "",
          srpPrivate: "",
          srpLgu: "",
          srpStan: "",
          companyCodename: ""
        });
      } else {
        alert(result.error || 'Failed to update product');
      }
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Failed to update product. Please try again.');
    }
  };

  const handleDeleteProduct = async (productId) => {
    try {
      const result = await deleteInventoryItem(productId);
      if (result.success) {
        await loadData();
      } else {
        alert(result.error || 'Failed to delete product');
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product. Please try again.');
    }
  };

  const requestDeleteProduct = (productId) => {
    openConfirmDialog({
      title: "Delete Inventory Item",
      message: "Are you sure you want to delete this product?",
      onConfirm: () => handleDeleteProduct(productId)
    });
  };

  const requestDeleteJobOrder = (jobId) => {
    openConfirmDialog({
      title: "Delete Job Order",
      message: "Are you sure you want to delete this job order?",
      onConfirm: () => handleDeleteJobOrder(jobId)
    });
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await logoutAPI(token);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  const normalizePdfLineItem = (item) => {
    const qty = parseFloat(item?.qty ?? item?.quantity ?? 0) || 0;
    const totalRaw = parseFloat(item?.price ?? item?.total);
    const unitRaw = parseFloat(item?.unitPrice ?? item?.unit_price);
    const total = Number.isNaN(totalRaw) ? 0 : totalRaw;
    const unitPrice = Number.isNaN(unitRaw) ? (qty > 0 ? total / qty : 0) : unitRaw;
    return { qty, unitPrice, total };
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

  const exportJobOrderPDF = async () => {
    const currentJob = editJobId !== null ? jobOrders.find(j => j.id === editJobId) : null;
    const rawJobNo = currentJob?.joNumber ?? currentJob?.job_order_no ?? jobOrderNo;

    const savedOrder = await persistJobOrder("Completed");
    if (!savedOrder) return;
    setStatus("Completed");

    const savedRawJobNo = savedOrder?.joNumber ?? savedOrder?.job_order_no ?? rawJobNo;
    const formattedJobNo = formatJobOrderNo(savedRawJobNo);

    const jobData = {
      joNumber: formattedJobNo,
      client: clientName,
      address,
      vehicleModel,
      plateNumber,
      dateIn,
      dateRelease,
      assignedTo,
      contactNumber,
      subtotal,
      discount,
      grandTotal,
      services,
      parts
    };

    const docDefinition = await buildPdfDocDefinition(jobData);
    pdfMake.createPdf(docDefinition).download(`JOB-ORDER-${jobData.joNumber}.pdf`);
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

  const viewJobOrderPDF = async (orderId) => {
    const order = jobOrders.find((j) => j.id === orderId);
    if (!order) return;
    const jobData = buildJobDataFromOrder(order);
    const docDefinition = await buildPdfDocDefinition(jobData);
    pdfMake.createPdf(docDefinition).open();
  };

  const downloadJobOrderPDF = async (orderId) => {
    const order = jobOrders.find((j) => j.id === orderId);
    if (!order) return;
    const jobData = buildJobDataFromOrder(order);
    const docDefinition = await buildPdfDocDefinition(jobData);
    pdfMake.createPdf(docDefinition).download(`JOB-ORDER-${jobData.joNumber}.pdf`);
  };

  const loadBase64Image = (url) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      fetch(url)
        .then(res => res.blob())
        .then(blob => {
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
    });
  };

  const todayKey = new Date().toISOString().slice(0, 10);
  const currentYear = todayKey.slice(0, 4);
  const totalSales = completedOrders.reduce((sum, o) => {
    const dateKey = (o.dateIn || o.date || "").slice(0, 10);
    if (!dateKey.startsWith(currentYear)) return sum;
    return sum + (parseFloat(o.total || o.total_amount || 0) || 0);
  }, 0);
  const dailySales = completedOrders.reduce((sum, o) => {
    const dateKey = (o.dateIn || o.date || "").slice(0, 10);
    if (dateKey !== todayKey) return sum;
    return sum + (parseFloat(o.total || o.total_amount || 0) || 0);
  }, 0);
  const dailyProfit = completedOrders.reduce((sum, o) => {
    const dateKey = (o.dateIn || o.date || "").slice(0, 10);
    if (dateKey !== todayKey) return sum;
    const totals = computeOrderTotals(o);
    return sum + totals.profit;
  }, 0);

  const filteredProducts = products.filter((p) => {
    if (!inventorySearch.trim()) return true;
    const q = inventorySearch.trim().toLowerCase();
    return [
      p.code,
      p.part_number,
      p.partNumber,
      p.name,
      p.description,
      p.company_codename,
      p.status
    ].some((v) => String(v || "").toLowerCase().includes(q));
  });

  const filteredJobOrders = jobOrders
    .filter((o) => {
      if (!jobSearch.trim()) return true;
      const q = jobSearch.trim().toLowerCase();
      return [
        o.joNumber,
        o.job_order_no,
        o.client,
        o.customer_name,
        o.vehicleModel,
        o.model,
        o.plate,
        o.plate_no,
        o.status,
        o.assignedTo,
        o.assigned_to
      ].some((v) => String(v || "").toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const aCompleted = (a.status || "") === "Completed" ? 1 : 0;
      const bCompleted = (b.status || "") === "Completed" ? 1 : 0;
      if (aCompleted !== bCompleted) return aCompleted - bCompleted;
      if (aCompleted === 1 && bCompleted === 1) {
        const aNo = parseInt(a.joNumber ?? a.job_order_no ?? 0, 10) || 0;
        const bNo = parseInt(b.joNumber ?? b.job_order_no ?? 0, 10) || 0;
        if (aNo !== bNo) return bNo - aNo;
      }
      return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
    });

  const editingJob = editJobId !== null ? jobOrders.find((j) => j.id === editJobId) : null;
  const modalJobNumber = editJobId !== null
    ? (editingJob?.status === "Completed" ? (editingJob?.joNumber ?? editingJob?.job_order_no ?? 0) : 0)
    : (status === "Completed" ? jobOrderNo : 0);

  const handleTabChange = (nextTab) => {
    if (nextTab === activeTab) return;
    const tabIndex = { dashboard: 0, inventory: 1, jobs: 2 };
    const currentIndex = tabIndex[activeTab] ?? 0;
    const nextIndex = tabIndex[nextTab] ?? 0;
    setTabDirection(nextIndex > currentIndex ? "slide-right" : "slide-left");
    setActiveTab(nextTab);
  };

  const handleJobStatusFilterChange = (nextFilter) => {
    if (nextFilter === jobStatusFilter) return;
    const filterIndex = {
      All: 0,
      Pending: 1,
      "In Progress": 2,
      Completed: 3
    };
    const currentIndex = filterIndex[jobStatusFilter] ?? 0;
    const nextIndex = filterIndex[nextFilter] ?? 0;
    setJobFilterDirection(nextIndex > currentIndex ? "slide-right" : "slide-left");
    setJobStatusFilter(nextFilter);
  };

  useEffect(() => {
    if (activeTab !== "inventory") return;

    let scanBuffer = "";
    let lastKeyTime = 0;
    const resetMs = 100;

    const isDialogOpen =
      showModal ||
      isEditModal ||
      showJobOrderModal ||
      confirmDialog.open ||
      infoDialog.open;

    if (!isDialogOpen) {
      requestAnimationFrame(() => {
        inventorySearchInputRef.current?.focus();
      });
    }

    const onKeyDown = (e) => {
      if (
        activeTab !== "inventory" ||
        showModal ||
        isEditModal ||
        showJobOrderModal ||
        confirmDialog.open ||
        infoDialog.open
      ) {
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      if (now - lastKeyTime > resetMs) {
        scanBuffer = "";
      }
      lastKeyTime = now;

      if (e.key === "Enter") {
        const scanned = scanBuffer.trim();
        if (scanned.length > 0) {
          setInventorySearch(toUpperInput(scanned));
          requestAnimationFrame(() => {
            inventorySearchInputRef.current?.focus();
            inventorySearchInputRef.current?.select();
          });
          e.preventDefault();
        }
        scanBuffer = "";
        return;
      }

      if (e.key.length === 1) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeTab, showModal, isEditModal, showJobOrderModal, confirmDialog.open, infoDialog.open]);

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

  const formatSavedDateTime = (order) => {
    const raw = order?.updated_at || order?.created_at;
    if (!raw) return "-";

    const normalized = String(raw).replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return String(raw);

    const datePart = formatDateMMDDYYYY(raw);
    const timePart = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
    return `${datePart} ${timePart}`;
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div className="content">
          <div className="left">
            <button
              type="button"
              onClick={() => navigate("/select-role")}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex" }}
              aria-label="Go to role select"
            >
              <img src={logoSrc} className="admin-logo" alt="Autronicas logo" />
            </button>
          </div>
          <nav className="admin-nav">
            <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => handleTabChange("dashboard")}>Dashboard</button>
            <button className={activeTab === "inventory" ? "active" : ""} onClick={() => handleTabChange("inventory")}>Inventory</button>
            <button className={activeTab === "jobs" ? "active" : ""} onClick={() => handleTabChange("jobs")}>Job Orders</button>
            <button className="logout" onClick={handleLogout}>Logout</button>
          </nav>
        </div>
      </header>

      <div className="dashboard-content">
        <div key={activeTab} className={`tab-slide-panel ${tabDirection}`}>
        {activeTab === "dashboard" && (
          <>
            <h2>Dashboard Overview</h2>
            <div className="cards-grid">
              <div className="card blue">
                <p className="card-title">Total Products</p>
                <h1 className="card-value">{dashboardStats?.total_products || products.length}</h1>
              </div>
              <div className="card purple">
                <p className="card-title">Total Jobs</p>
                <h1 className="card-value">{dashboardStats?.total_jobs || jobOrders.length}</h1>
              </div>
              <div className="card green">
                <p className="card-title">Total Sales</p>
                <h1 className="card-value">₱{totalSales.toFixed(2)}</h1>
                <p className="card-subvalue">Total Profit: ₱{totalProfit.toFixed(2)}</p>
              </div>
              <div className="card green">
                <p className="card-title">Daily Sales</p>
                <h1 className="card-value">₱{dailySales.toFixed(2)}</h1>
                <p className="card-subvalue">Daily Profit: ₱{dailyProfit.toFixed(2)}</p>
              </div>
            </div>
          </>
        )}

        {activeTab === "inventory" && (
          <>
            <div className="inventory-header">
              <h2>Inventory Management</h2>
              <button className="add-product-btn" onClick={() => {
                setNewProduct({
                  code: "",
                  partNumber: "",
                  name: "",
                  quantity: "",
                  price: "",
                  srpPrivate: "",
                  srpLgu: "",
                  srpStan: "",
                  companyCodename: ""
                });
                setShowModal(true);
              }}>Add Product</button>
            </div>
            <div className="inventory-search">
              <input
                ref={inventorySearchInputRef}
                className="search-input"
                type="text"
                placeholder="Search inventory or scan barcode..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(toUpperInput(e.target.value))}
              />
            </div>
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>CODE</th>
                  <th>PART NUMBER</th>
                  <th>PRODUCT</th>
                  <th>STOCKS</th>
                  <th>COMPANY</th>
                  <th>STATUS</th>
                  <th>UNIT PRICE</th>
                  <th>PRIVATE SRP</th>
                  <th>LGU SRP</th>
                  <th>STAN SRP</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr><td colSpan="11" className="empty-message">No products added yet.</td></tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.id}>
                      <td>{p.code}</td>
                      <td>{p.part_number || p.partNumber || '-'}</td>
                      <td>{p.name}</td>
                      <td>{p.stocks}</td>
                      <td>{p.company_codename || '-'}</td>
                      <td>
                        <span className={p.status === "Out of Stock" ? "status-tag red" : "status-tag green"}>
                          {p.status}
                        </span>
                      </td>
                      <td>₱{parseFloat(p.price).toFixed(2)}</td>
                      <td>₱{parseFloat(p.srp_private || 0).toFixed(2)}</td>
                      <td>₱{parseFloat(p.srp_lgu || 0).toFixed(2)}</td>
                      <td>₱{parseFloat(p.srp_stan || 0).toFixed(2)}</td>
                      <td>
                        <button className="edit-btn" onClick={() => openEditModal(p.id)}>Edit</button>
                        <button className="delete-btn" onClick={() => requestDeleteProduct(p.id)}>Delete</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}

        {activeTab === "jobs" && (
          <div className="joborders-section">
            <div className="joborders-header">
              <h2>Job Order Management</h2>
              <button className="create-joborder-btn" onClick={() => { resetJobForm(); setEditJobId(null); setShowJobOrderModal(true); }}>Create New Job Order</button>
            </div>
            <div className="joborders-search">
              <input
                className="search-input"
                type="text"
                placeholder="Search job orders..."
                value={jobSearch}
                onChange={(e) => setJobSearch(toUpperInput(e.target.value))}
              />
            </div>
            <div className="joborders-filters">
              <button className={jobStatusFilter === "All" ? "active" : ""} onClick={() => handleJobStatusFilterChange("All")}>All</button>
              <button className={jobStatusFilter === "Pending" ? "active" : ""} onClick={() => handleJobStatusFilterChange("Pending")}>Pending</button>
              <button className={jobStatusFilter === "In Progress" ? "active" : ""} onClick={() => handleJobStatusFilterChange("In Progress")}>In Progress</button>
              <button className={jobStatusFilter === "Completed" ? "active" : ""} onClick={() => handleJobStatusFilterChange("Completed")}>Completed</button>
            </div>
            <div key={jobStatusFilter} className={`job-filter-slide-panel ${jobFilterDirection}`}>
              <div className="joborders-table-wrapper">
                <table className="joborders-table">
                  <colgroup>
                    <col className="col-jo" />
                    <col className="col-client" />
                    <col className="col-vehicle" />
                    <col className="col-plate" />
                    <col className="col-total" />
                    <col className="col-status" />
                    <col className="col-assigned" />
                    <col className="col-datein" />
                    <col className="col-daterel" />
                    <col className="col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>JOB ORDER NO.</th>
                      <th>CLIENT NAME</th>
                      <th>VEHICLE MODEL</th>
                      <th>PLATE NUMBER</th>
                      <th>TOTAL PRICE</th>
                      <th>STATUS</th>
                      <th>ASSIGNED TO</th>
                      <th>DATE IN</th>
                      <th>DATE RELEASE</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobOrders.filter(o => jobStatusFilter === "All" || o.status === jobStatusFilter).length === 0 ? (
                      <tr><td colSpan="10" className="empty-message">No job orders created yet.</td></tr>
                    ) : (
                      filteredJobOrders
                        .filter(o => jobStatusFilter === "All" || o.status === jobStatusFilter)
                        .map((o) => (
                        <tr key={o.id}>
                          <td>{formatJobOrderNo(o.status === "Completed" ? (o.joNumber ?? o.job_order_no ?? 0) : 0)}</td>
                          <td>{o.client || o.customer_name}</td>
                          <td>{o.vehicleModel || o.model}</td>
                          <td>{o.plate || o.plate_no}</td>
                          <td>₱{Number(o.total || o.total_amount || 0).toFixed(2)}</td>
                          <td>
                            <span className={o.status === "Pending" ? "status-tag yellow" : o.status === "In Progress" ? "status-tag blue" : "status-tag green"}>{o.status}</span>
                          </td>
                          <td>{o.assignedTo || o.assigned_to}</td>
                          <td>{formatDateMMDDYYYY(o.dateIn || o.date)}</td>
                          <td>{formatDateMMDDYYYY(o.dateRelease || o.date_release)}</td>
                          <td className="actions">
                            {o.status === "Completed" ? (
                              <div className="actions-stack">
                                <button className="view-edit-btn" onClick={() => viewJobOrderPDF(o.id)}>View</button>
                                <button className="view-edit-btn" onClick={() => downloadJobOrderPDF(o.id)}>Download</button>
                              </div>
                            ) : (
                              <div className="actions-stack">
                                <button className="view-edit-btn" onClick={() => handleEditJob(o.id)}>Edit</button>
                                <button className="delete-btn" onClick={() => requestDeleteJobOrder(o.id)}>Delete</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        </div>

        {showJobOrderModal && (
          <div className="joborder-overlay">
            <div className="joborder-modal">
              <div className="modal-header">
                <p className="joborder-inline"><strong>
                  Job Order No. {formatJobOrderNo(modalJobNumber)}
                </strong>
                </p>
                <button className="export-btn" onClick={exportJobOrderPDF} disabled={!isJobFormValid()}>Download PDF</button>
              </div>

              <div className="modal-body">
                <div className="form-grid">
                  <div className="left">
                    <label>Client Name</label>
                    <input type="text" placeholder="Enter client name" value={clientName} onChange={(e) => setClientName(toUpperInput(e.target.value))} disabled={isJobReadOnly} />
                    <label>Address</label>
                    <input type="text" placeholder="Enter address" value={address} onChange={(e) => setAddress(toUpperInput(e.target.value))} disabled={isJobReadOnly} />
                    <label>Vehicle Model</label>
                    <input type="text" placeholder="Enter vehicle model" value={vehicleModel} onChange={(e) => setVehicleModel(toUpperInput(e.target.value))} disabled={isJobReadOnly} />
                    <label>Date In</label>
                    <input type="date" value={dateIn} onChange={(e) => setDateIn(e.target.value)} disabled={isJobReadOnly} />
                    <label>Assigned To</label>
                    <input type="text" placeholder="Enter mechanic" value={assignedTo} onChange={(e) => setAssignedTo(toUpperInput(e.target.value))} disabled={isJobReadOnly} />
                    <label>Payment Type</label>
                    <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)} disabled={isJobReadOnly}>
                      <option value="Accounts Receivable">Accounts Receivable</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                  <div className="right">
                    <label>Customer Type</label>
                    <select value={customerType} onChange={(e) => setCustomerType(e.target.value)} disabled={isJobReadOnly}>
                      <option value="">Select</option>
                      <option value="Private">Private</option>
                      <option value="LGU">LGU</option>
                      <option value="STAN">STAN</option>
                    </select>
                    <label>Contact Number</label>
                    <input type="text" placeholder="Enter contact number" value={contactNumber} onChange={(e) => setContactNumber(toUpperInput(e.target.value))} disabled={isJobReadOnly} />
                    <label>Plate Number</label>
                    <input type="text" placeholder="Enter plate number" value={plateNumber} onChange={(e) => setPlateNumber(toUpperInput(e.target.value))} disabled={isJobReadOnly} />
                    <label>Date Release</label>
                    <input type="date" value={dateRelease} onChange={(e) => setDateRelease(e.target.value)} disabled={isJobReadOnly} />
                    <label>Status</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={isJobReadOnly}>
                      <option>Pending</option>
                      <option>In Progress</option>
                      <option>Completed</option>
                    </select>
                  </div>
                </div>

                <h3 className="section-title">Services</h3>
                <div className="table-headers services-head">
                  <span>Description</span><span>Unit</span><span>Qty</span><span>Price (PHP)</span><span>Total Price (PHP)</span><span></span>
                </div>
                {services.map((s, i) => (
                  <div className="item-row services-row" key={`s-${i}`}>
                    <input type="text" placeholder="Description" value={s.description} onChange={(e) => updateService(i, "description", e.target.value)} disabled={isJobReadOnly} />
                    <input type="text" placeholder="Unit" value={s.unit} onChange={(e) => updateService(i, "unit", e.target.value)} disabled={isJobReadOnly} />
                    <input type="number" min="0" placeholder="Qty" value={s.qty} onChange={(e) => updateService(i, "qty", e.target.value)} disabled={isJobReadOnly} />
                    <input type="number" min="0" step="0.01" placeholder="Price" value={s.unitPrice} onChange={(e) => updateService(i, "price", e.target.value)} onFocus={(e) => e.target.select()} disabled={isJobReadOnly} />
                    <input type="number" min="0" step="0.01" placeholder="Total Price" value={s.price} />
                    {services.length > 1 && (
                      <button className="delete-box" onClick={() => deleteService(i)} aria-label="Delete service" disabled={isJobReadOnly}>X</button>
                    )}
                  </div>
                ))}
                <button className="small-btn" onClick={addServiceRow} disabled={isJobReadOnly}>+ Add Service</button>

                <h3 className="section-title">Parts</h3>
                <div className="table-headers parts-head">
                  <span>Description</span><span>Unit</span><span>Qty</span><span>Price (PHP)</span><span>Total Price (PHP)</span><span></span>
                </div>
                {parts.map((p, i) => (
                  <div className="item-row parts-row" key={`p-${i}`}>
                    <input
                      type="text"
                      placeholder="Description"
                      value={p.description}
                      onChange={(e) => updatePart(i, "description", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          updatePart(i, "description", e.currentTarget.value, { commit: true });
                        }
                      }}
                      disabled={isJobReadOnly}
                    />
                    <input type="text" placeholder="Unit" value={p.unit} onChange={(e) => updatePart(i, "unit", e.target.value)} disabled={isJobReadOnly} />
                    <input type="number" min="0" placeholder="Qty" value={p.qty} onChange={(e) => updatePart(i, "qty", e.target.value)} disabled={isJobReadOnly} />
                    <input type="number" min="0" step="0.01" placeholder="Price" value={p.unitPrice} onChange={(e) => updatePart(i, "price", e.target.value)} onFocus={(e) => e.target.select()} disabled={isJobReadOnly} />
                    <input type="number" min="0" step="0.01" placeholder="Total Price" value={p.price} />
                    {parts.length > 1 && (
                      <button className="delete-box" onClick={() => deletePart(i)} aria-label="Delete part" disabled={isJobReadOnly}>X</button>
                    )}
                  </div>
                ))}
                <button className="small-btn" onClick={addPartRow} disabled={isJobReadOnly}>+ Add Part</button>

                <hr />
                <div className="totals">
                  <p>Subtotal: ₱{Number(subtotal).toFixed(2)}</p>
                  <p>
                    Discount: ₱
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      style={{ width: 120, marginLeft: 6 }}
                      disabled={isJobReadOnly}
                    />
                  </p>
                  <p><b>Total: ₱{Number(grandTotal).toFixed(2)}</b></p>
                </div>
              </div>

              <div className="modal-footer" style={{ justifyContent: "flex-end", gap: 12 }}>
                <button className="footer-btn back" onClick={() => { setShowJobOrderModal(false); setEditJobId(null); resetJobForm(); }}>Cancel</button>
                <button className="footer-btn finalize" onClick={saveJobOrder} disabled={!isJobFormValid() || isJobReadOnly}>Save</button>
              </div>
            </div>
          </div>
        )}

        {showModal && (
          <div className="modal-container centered-modal">
            <div className="modal-box product-modal">
              <div className="product-modal-header">
                <h2>Add New Product</h2>
              </div>
              <div className="product-modal-body">
                <label>Code (Barcode)</label>
                <input
                  type="text"
                  placeholder="Scan or enter code"
                  value={newProduct.code}
                  onChange={(e) => setNewProduct({ ...newProduct, code: toUpperInput(e.target.value) })}
                  autoFocus
                />

                <label>Part Number</label>
                <input
                  type="text"
                  placeholder="Enter part number"
                  value={newProduct.partNumber}
                  onChange={(e) => setNewProduct({ ...newProduct, partNumber: toUpperInput(e.target.value) })}
                />

                <label>Product Name</label>
                <input type="text" placeholder="Enter Product Name" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: toUpperInput(e.target.value) })} />
                <label>Company</label>
                <input type="text" placeholder="Enter company name" value={newProduct.companyCodename} onChange={(e) => setNewProduct({ ...newProduct, companyCodename: toUpperInput(e.target.value) })} />
                <label>Quantity</label>
                <input type="number" placeholder="Enter Quantity" value={newProduct.quantity} onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })} />
                <label>Unit Price</label>
                <input type="number" placeholder="Enter Unit Price" step="0.01" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} />
              </div>
              <div className="product-modal-footer modal-actions">
                <button className="cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="save" disabled={!isFormValid()} onClick={handleAddProduct}>Save</button>
              </div>
            </div>
          </div>
        )}

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

        {infoDialog.open && (
          <div className="modal-container centered-modal" style={{ zIndex: 12000 }}>
            <div className="modal-box product-modal" style={{ maxWidth: 460 }}>
              <div className="product-modal-header">
                <h2>{infoDialog.title}</h2>
              </div>
              <div className="product-modal-body">
                <p style={{ whiteSpace: "pre-line" }}>{infoDialog.message}</p>
              </div>
              <div className="product-modal-footer modal-actions">
                <button className="save" onClick={closeInfoDialog}>OK</button>
              </div>
            </div>
          </div>
        )}

        {isEditModal && (
          <div className="modal-container">
            <div className="modal-box product-modal">
              <div className="product-modal-header">
                <h2>Edit Product</h2>
              </div>
              <div className="product-modal-body">
                <label>Code</label>
                <input type="text" value={newProduct.code} onChange={(e) => setNewProduct({ ...newProduct, code: toUpperInput(e.target.value) })} />
                <label>Part Number</label>
                <input type="text" value={newProduct.partNumber} onChange={(e) => setNewProduct({ ...newProduct, partNumber: toUpperInput(e.target.value) })} />
                <label>Product Name</label>
                <input type="text" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: toUpperInput(e.target.value) })} />
                <label>Company</label>
                <input type="text" value={newProduct.companyCodename} onChange={(e) => setNewProduct({ ...newProduct, companyCodename: toUpperInput(e.target.value) })} />
                <label>Quantity</label>
                <input type="number" value={newProduct.quantity} onChange={(e) => setNewProduct({ ...newProduct, quantity: e.target.value })} />
                <label>Unit Price</label>
                <input type="number" step="0.01" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} />
                <label>Private SRP</label>
                <input type="number" step="0.01" value={newProduct.srpPrivate} onChange={(e) => setNewProduct({ ...newProduct, srpPrivate: e.target.value })} />
                <label>LGU SRP</label>
                <input type="number" step="0.01" value={newProduct.srpLgu} onChange={(e) => setNewProduct({ ...newProduct, srpLgu: e.target.value })} />
                <label>STAN SRP</label>
                <input type="number" step="0.01" value={newProduct.srpStan} onChange={(e) => setNewProduct({ ...newProduct, srpStan: e.target.value })} />
              </div>
              <div className="product-modal-footer modal-actions">
                <button className="cancel" onClick={() => { setIsEditModal(false); setEditProductId(null); }}>Cancel</button>
                <button className="save" disabled={!isFormValid()} onClick={handleSaveEdit}>Save Changes</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;



