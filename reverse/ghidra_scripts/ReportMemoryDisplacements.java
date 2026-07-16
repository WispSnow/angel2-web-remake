// Reports instructions whose memory operand uses selected small displacements.
// @category Angel2

import java.util.HashSet;
import java.util.Set;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.lang.Register;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.scalar.Scalar;

public class ReportMemoryDisplacements extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("Expected one or more hexadecimal displacements");
        }
        Set<Long> targets = new HashSet<>();
        for (String arg : args) {
            targets.add(Long.parseLong(arg.replaceFirst("^0[xX]", ""), 16));
        }

        int matches = 0;
        InstructionIterator instructions = currentProgram.getListing().getInstructions(true);
        while (instructions.hasNext()) {
            Instruction instruction = instructions.next();
            for (int operand = 0; operand < instruction.getNumOperands(); operand++) {
                boolean hasRegister = false;
                Long displacement = null;
                for (Object object : instruction.getOpObjects(operand)) {
                    if (object instanceof Register) {
                        hasRegister = true;
                    }
                    else if (object instanceof Scalar) {
                        long value = ((Scalar) object).getUnsignedValue();
                        if (targets.contains(value)) {
                            displacement = value;
                        }
                    }
                }
                if (!hasRegister || displacement == null) {
                    continue;
                }
                Function function = getFunctionContaining(instruction.getAddress());
                println("disp=" + Long.toHexString(displacement) +
                    " at=" + instruction.getAddress() +
                    " op=" + operand +
                    " function=" + (function == null ? "<none>" : function.getName()) +
                    " instruction=" + instruction);
                matches++;
            }
        }
        println("matches=" + matches);
    }
}
